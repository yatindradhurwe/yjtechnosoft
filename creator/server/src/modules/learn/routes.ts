import { Router } from 'express';
import { z } from 'zod';
import { prisma, Db } from '../../lib/prisma';
import { badRequest, forbidden, notFound } from '../../lib/errors';
import { randomToken } from '../../lib/crypto';
import { body, parse } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { canAccessCourse, hasEntitlement, isStaffWith } from '../../services/access';
import { signMediaUrl } from '../../services/storage';
import { computeUnlocks, ensureEnrollment, isCourseLive, orderedLessons, recalcProgress } from '../courses/service';
import { awardPoints } from '../gamification/service';

export const learnRouter = Router();

const id = z.string().uuid();

learnRouter.get('/library', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const now = new Date();
  const ents = await prisma.entitlement.findMany({
    where: { userId, status: 'ACTIVE', startsAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
  });
  const tenantIds = [...new Set(ents.map((e) => e.tenantId))];
  const courseIds = [...new Set(ents.filter((e) => e.resourceType === 'COURSE').map((e) => e.resourceId))];
  const downloadIds = [...new Set(ents.filter((e) => e.resourceType === 'DOWNLOAD').map((e) => e.resourceId))];
  const [tenants, courses, enrollments, downloads, subscriptions] = await Promise.all([
    prisma.tenant.findMany({ where: { id: { in: tenantIds } }, select: { id: true, slug: true, name: true, logoUrl: true, primaryColor: true } }),
    prisma.course.findMany({ where: { id: { in: courseIds }, deletedAt: null }, select: { id: true, tenantId: true, title: true, subtitle: true, coverUrl: true, status: true, publishAt: true, deletedAt: true } }),
    prisma.enrollment.findMany({ where: { userId, courseId: { in: courseIds } } }),
    prisma.mediaAsset.findMany({ where: { id: { in: downloadIds }, deletedAt: null }, select: { id: true, tenantId: true, filename: true, sizeBytes: true, mimeType: true } }),
    prisma.customerSubscription.findMany({ where: { userId }, orderBy: { currentPeriodEnd: 'desc' } }),
  ]);
  const subProducts = await prisma.product.findMany({ where: { id: { in: subscriptions.map((s) => s.productId) } }, select: { id: true, title: true, slug: true } });
  res.json({
    workspaces: tenants,
    courses: courses
      .filter((c) => isCourseLive(c))
      .map((c) => {
        const e = enrollments.find((x) => x.courseId === c.id);
        return { id: c.id, tenantId: c.tenantId, title: c.title, subtitle: c.subtitle, coverUrl: c.coverUrl, progressPct: e?.progressPct ?? 0, lastLessonId: e?.lastLessonId, status: e?.status };
      }),
    downloads,
    subscriptions: subscriptions.map((s) => ({ ...s, product: subProducts.find((p) => p.id === s.productId) })),
  });
});

async function loadLiveCourse(courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || course.deletedAt) throw notFound('Course not found');
  return course;
}

/** Course player outline with per-lesson lock state, all evaluated server-side */
learnRouter.get('/courses/:courseId', requireAuth, async (req, res) => {
  const course = await loadLiveCourse(parse(id, req.params.courseId));
  const userId = req.user!.id;
  const staff = await isStaffWith(userId, course.tenantId, 'courses.read');
  const entitled = await hasEntitlement(userId, course.tenantId, 'COURSE', course.id);
  if (!entitled && !staff) throw forbidden('You do not have access to this course');
  if (!staff && !isCourseLive(course)) throw forbidden('This course is not available right now');

  const enrollment = entitled ? await ensureEnrollment(course.tenantId, course.id, userId) : null;
  const { modules, lessons } = await orderedLessons(course.id, prisma, true);
  const progress = enrollment ? await prisma.lessonProgress.findMany({ where: { enrollmentId: enrollment.id } }) : [];
  const unlocks = staff && !entitled ? new Map() : computeUnlocks(course, lessons, enrollment, progress);
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: course.tenantId }, select: { id: true, slug: true, name: true, logoUrl: true, primaryColor: true } });
  const certificate = enrollment ? await prisma.certificate.findUnique({ where: { courseId_userId: { courseId: course.id, userId } } }) : null;
  const review = await prisma.courseReview.findUnique({ where: { courseId_userId: { courseId: course.id, userId } } });
  res.json({
    tenant,
    course: { id: course.id, title: course.title, subtitle: course.subtitle, description: course.description, coverUrl: course.coverUrl, dripMode: course.dripMode, certificateEnabled: course.certificateEnabled },
    preview: staff && !entitled,
    enrollment: enrollment && { progressPct: enrollment.progressPct, status: enrollment.status, lastLessonId: enrollment.lastLessonId, enrolledAt: enrollment.enrolledAt },
    modules: modules.map((m) => ({
      id: m.id,
      title: m.title,
      lessons: m.lessons.map((l) => {
        const u = unlocks.get(l.id) ?? { locked: false, reason: null };
        const p = progress.find((x) => x.lessonId === l.id);
        return { id: l.id, title: l.title, type: l.type, durationSec: l.durationSec, locked: u.locked, lockReason: u.reason, unlocksAt: u.unlocksAt, completed: !!p?.completedAt };
      }),
    })),
    certificate: certificate && { verificationCode: certificate.verificationCode, issuedAt: certificate.issuedAt },
    review,
  });
});

async function lessonAccess(lessonId: string, userId: string) {
  const lesson = await prisma.lesson.findUnique({
    where: { id: lessonId },
    include: { course: true, resources: true, quiz: { include: { questions: { orderBy: { position: 'asc' } } } }, assignment: true },
  });
  if (!lesson || lesson.course.deletedAt || !lesson.published) throw notFound('Lesson not found');
  const course = lesson.course;
  const staff = await isStaffWith(userId, course.tenantId, 'courses.read');
  const entitled = await hasEntitlement(userId, course.tenantId, 'COURSE', course.id);
  const live = isCourseLive(course);
  const freePreview = lesson.isPreview && live;
  if (!staff && !(entitled && live) && !freePreview) throw forbidden('Purchase this course to watch this lesson');

  let enrollment = null;
  if (entitled) {
    enrollment = await ensureEnrollment(course.tenantId, course.id, userId);
    if (!staff) {
      const { lessons } = await orderedLessons(course.id, prisma, true);
      const progress = await prisma.lessonProgress.findMany({ where: { enrollmentId: enrollment.id } });
      const state = computeUnlocks(course, lessons, enrollment, progress).get(lesson.id);
      if (state?.locked) {
        throw forbidden(state.reason === 'previous_incomplete' ? 'Complete the previous lessons first' : `This lesson unlocks on ${state.unlocksAt?.toDateString()}`);
      }
    }
  }
  return { lesson, course, enrollment, staff };
}

learnRouter.get('/lessons/:lessonId', requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { lesson, enrollment } = await lessonAccess(parse(id, req.params.lessonId), userId);
  const media = lesson.mediaAssetId ? await prisma.mediaAsset.findFirst({ where: { id: lesson.mediaAssetId, deletedAt: null } }) : null;
  const resourceAssets = await prisma.mediaAsset.findMany({ where: { id: { in: lesson.resources.map((r) => r.mediaAssetId) }, deletedAt: null } });
  const progress = enrollment ? await prisma.lessonProgress.findUnique({ where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: lesson.id } } }) : null;
  if (enrollment) await prisma.enrollment.update({ where: { id: enrollment.id }, data: { lastLessonId: lesson.id } });
  const submission = lesson.assignment ? await prisma.assignmentSubmission.findUnique({ where: { assignmentId_userId: { assignmentId: lesson.assignment.id, userId } } }) : null;
  const lastAttempt = lesson.quiz ? await prisma.quizAttempt.findFirst({ where: { quizId: lesson.quiz.id, userId }, orderBy: { createdAt: 'desc' } }) : null;
  res.json({
    lesson: {
      id: lesson.id,
      courseId: lesson.courseId,
      title: lesson.title,
      type: lesson.type,
      body: lesson.body,
      embedUrl: lesson.embedUrl,
      durationSec: lesson.durationSec,
      // Short-lived, user-bound URL: sharing it with someone else stops working within minutes
      media: media ? { url: signMediaUrl(media.id, userId, 4 * 3600), mimeType: media.mimeType, kind: media.kind } : null,
      resources: lesson.resources
        .filter((r) => resourceAssets.some((a) => a.id === r.mediaAssetId))
        .map((r) => ({ id: r.id, title: r.title, url: `${signMediaUrl(r.mediaAssetId, userId, 600)}&download=1` })),
      // Correct answers are never sent to the browser
      quiz: lesson.quiz && { passPct: lesson.quiz.passPct, questions: lesson.quiz.questions.map((q) => ({ id: q.id, prompt: q.prompt, type: q.type, options: q.options, points: q.points })) },
      assignment: lesson.assignment && { instructions: lesson.assignment.instructions, maxScore: lesson.assignment.maxScore },
    },
    progress: progress && { completed: !!progress.completedAt, positionSec: progress.positionSec },
    submission,
    lastAttempt: lastAttempt && { score: lastAttempt.score, maxScore: lastAttempt.maxScore, passed: lastAttempt.passed, createdAt: lastAttempt.createdAt },
  });
});

async function completeLesson(db: Db, enrollmentId: string, lessonId: string, userId: string, tenantId: string) {
  await db.lessonProgress.upsert({
    where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
    create: { tenantId, enrollmentId, lessonId, userId, completedAt: new Date() },
    update: { completedAt: new Date() },
  });
  await awardPoints(db, { tenantId, userId, points: 10, reason: 'Lesson completed', sourceKey: `lesson:${lessonId}` });
  const e = await recalcProgress(enrollmentId, db);
  if (e.status === 'COMPLETED') await onCourseCompleted(db, e.courseId, userId, tenantId);
  return e;
}

async function onCourseCompleted(db: Db, courseId: string, userId: string, tenantId: string) {
  await awardPoints(db, { tenantId, userId, points: 100, reason: 'Course completed', sourceKey: `course:${courseId}` });
  const course = await db.course.findUniqueOrThrow({ where: { id: courseId } });
  if (!course.certificateEnabled) return;
  const existing = await db.certificate.findUnique({ where: { courseId_userId: { courseId, userId } } });
  if (existing) return;
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.certificate.create({
    data: { tenantId, courseId, userId, recipientName: user.name, courseTitle: course.title, verificationCode: randomToken(9).toUpperCase().replace(/[^A-Z0-9]/g, 'X').slice(0, 12) },
  });
  await db.notification.create({ data: { tenantId, userId, type: 'certificate.issued', title: 'Congratulations! Your certificate is ready', body: course.title, link: `/learn/course/${courseId}` } });
}

learnRouter.post('/lessons/:lessonId/progress', requireAuth, async (req, res) => {
  const input = body(req, z.object({ positionSec: z.number().int().min(0).max(86400).optional(), completed: z.boolean().optional() }));
  const userId = req.user!.id;
  const { lesson, enrollment } = await lessonAccess(parse(id, req.params.lessonId), userId);
  if (!enrollment) throw forbidden('Enrol in the course to track progress');
  if (input.completed && (lesson.type === 'QUIZ' || lesson.type === 'ASSIGNMENT')) throw badRequest('Complete this lesson by passing the quiz or submitting the assignment');
  if (input.positionSec !== undefined) {
    await prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: lesson.id } },
      create: { tenantId: lesson.tenantId, enrollmentId: enrollment.id, lessonId: lesson.id, userId, positionSec: input.positionSec },
      update: { positionSec: input.positionSec },
    });
  }
  let e = enrollment;
  if (input.completed) e = await prisma.$transaction((tx) => completeLesson(tx, enrollment.id, lesson.id, userId, lesson.tenantId));
  else if (input.completed === false) {
    await prisma.lessonProgress.updateMany({ where: { enrollmentId: enrollment.id, lessonId: lesson.id }, data: { completedAt: null } });
    e = await recalcProgress(enrollment.id);
  }
  res.json({ progressPct: e.progressPct, status: e.status });
});

learnRouter.post('/lessons/:lessonId/quiz', requireAuth, async (req, res) => {
  const input = body(req, z.object({ answers: z.record(z.string().uuid(), z.array(z.number().int().min(0)).max(10)) }));
  const userId = req.user!.id;
  const { lesson, enrollment } = await lessonAccess(parse(id, req.params.lessonId), userId);
  if (!lesson.quiz) throw badRequest('This lesson has no quiz');
  if (!enrollment) throw forbidden('Enrol in the course to take the quiz');
  const recent = await prisma.quizAttempt.count({ where: { quizId: lesson.quiz.id, userId, createdAt: { gte: new Date(Date.now() - 60_000) } } });
  if (recent >= 5) throw badRequest('Too many attempts, please wait a minute');
  let score = 0;
  let maxScore = 0;
  const results: Record<string, boolean> = {};
  for (const q of lesson.quiz.questions) {
    maxScore += q.points;
    const correct = [...(q.correct as number[])].sort().join(',');
    const given = [...new Set(input.answers[q.id] ?? [])].sort().join(',');
    results[q.id] = correct === given;
    if (results[q.id]) score += q.points;
  }
  const passed = maxScore > 0 && (score / maxScore) * 100 >= lesson.quiz.passPct;
  const e = await prisma.$transaction(async (tx) => {
    await tx.quizAttempt.create({ data: { quizId: lesson.quiz!.id, userId, answers: input.answers, score, maxScore, passed } });
    return passed ? completeLesson(tx, enrollment.id, lesson.id, userId, lesson.tenantId) : null;
  });
  res.json({ score, maxScore, passed, passPct: lesson.quiz.passPct, results, progressPct: e?.progressPct });
});

learnRouter.post('/lessons/:lessonId/assignment', requireAuth, async (req, res) => {
  const input = body(req, z.object({ text: z.string().trim().min(1).max(20000) }));
  const userId = req.user!.id;
  const { lesson, enrollment } = await lessonAccess(parse(id, req.params.lessonId), userId);
  if (!lesson.assignment) throw badRequest('This lesson has no assignment');
  if (!enrollment) throw forbidden('Enrol in the course to submit');
  const existing = await prisma.assignmentSubmission.findUnique({ where: { assignmentId_userId: { assignmentId: lesson.assignment.id, userId } } });
  if (existing?.status === 'GRADED') throw badRequest('This assignment has already been graded');
  const submission = await prisma.$transaction(async (tx) => {
    const s = await tx.assignmentSubmission.upsert({
      where: { assignmentId_userId: { assignmentId: lesson.assignment!.id, userId } },
      create: { assignmentId: lesson.assignment!.id, userId, text: input.text },
      update: { text: input.text, status: 'SUBMITTED' },
    });
    await completeLesson(tx, enrollment.id, lesson.id, userId, lesson.tenantId);
    return s;
  });
  res.status(201).json({ submission });
});

learnRouter.post('/courses/:courseId/review', requireAuth, async (req, res) => {
  const course = await loadLiveCourse(parse(id, req.params.courseId));
  if (!(await hasEntitlement(req.user!.id, course.tenantId, 'COURSE', course.id))) throw forbidden('Only enrolled students can review');
  const input = body(req, z.object({ rating: z.number().int().min(1).max(5), body: z.string().trim().max(2000).optional() }));
  const review = await prisma.courseReview.upsert({
    where: { courseId_userId: { courseId: course.id, userId: req.user!.id } },
    create: { ...input, tenantId: course.tenantId, courseId: course.id, userId: req.user!.id },
    update: input,
  });
  res.json({ review });
});

learnRouter.get('/certificates', requireAuth, async (req, res) => {
  res.json({ certificates: await prisma.certificate.findMany({ where: { userId: req.user!.id }, orderBy: { issuedAt: 'desc' } }) });
});

learnRouter.get('/notifications', requireAuth, async (req, res) => {
  const [items, unread] = await Promise.all([
    prisma.notification.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 30 }),
    prisma.notification.count({ where: { userId: req.user!.id, readAt: null } }),
  ]);
  res.json({ items, unread });
});

learnRouter.post('/notifications/read', requireAuth, async (req, res) => {
  const input = body(req, z.object({ ids: z.array(z.string().uuid()).max(100).optional() }));
  await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null, ...(input.ids ? { id: { in: input.ids } } : {}) }, data: { readAt: new Date() } });
  res.json({ ok: true });
});

/** Public certificate verification */
export const certificatePublicRouter = Router();
certificatePublicRouter.get('/:code', async (req, res) => {
  const cert = await prisma.certificate.findUnique({ where: { verificationCode: String(req.params.code).toUpperCase() } });
  if (!cert) throw notFound('No certificate with this ID');
  const tenant = await prisma.tenant.findUniqueOrThrow({ where: { id: cert.tenantId }, select: { name: true, slug: true, logoUrl: true, primaryColor: true } });
  res.json({ certificate: { recipientName: cert.recipientName, courseTitle: cert.courseTitle, issuedAt: cert.issuedAt, verificationCode: cert.verificationCode }, issuer: tenant });
});

export { canAccessCourse };
