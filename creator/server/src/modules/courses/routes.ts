import { Router } from 'express';
import { z } from 'zod';
import { prisma, isUniqueViolation } from '../../lib/prisma';
import { badRequest, conflict, notFound } from '../../lib/errors';
import { body, email, pageArgs, pagination, parse, query, safeUrl, slug, slugify } from '../../lib/validate';
import { requireAuth } from '../../middleware/auth';
import { can, requireTenantStaff } from '../../middleware/tenant';
import { audit } from '../../services/audit';
import { assertWithinLimit } from '../../services/plans';
import { grantEntitlement, revokeEntitlement } from '../commerce/fulfilment';
import { upsertContact } from '../customers/service';

/** Creator-side course management. All routes are scoped to the X-Tenant workspace. */
export const coursesRouter = Router();
coursesRouter.use(requireAuth, requireTenantStaff);

const id = z.string().uuid();

async function loadCourse(tenantId: string, courseId: string) {
  const course = await prisma.course.findFirst({ where: { id: courseId, tenantId, deletedAt: null } });
  if (!course) throw notFound('Course not found');
  return course;
}

async function loadModule(tenantId: string, moduleId: string) {
  const mod = await prisma.courseModule.findFirst({ where: { id: moduleId, tenantId } });
  if (!mod) throw notFound('Module not found');
  return mod;
}

async function loadLesson(tenantId: string, lessonId: string) {
  const lesson = await prisma.lesson.findFirst({ where: { id: lessonId, tenantId } });
  if (!lesson) throw notFound('Lesson not found');
  return lesson;
}

/** Media ids referenced by content must belong to the same workspace */
async function assertOwnAsset(tenantId: string, assetId: string | null | undefined) {
  if (!assetId) return;
  const a = await prisma.mediaAsset.findFirst({ where: { id: assetId, tenantId, deletedAt: null } });
  if (!a) throw badRequest('Media file not found in this workspace');
}

// ---------------------------------------------------------------------------
// Courses
// ---------------------------------------------------------------------------

coursesRouter.get('/', can('courses.read'), async (req, res) => {
  const p = query(req, pagination.extend({ status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED']).optional() }));
  const where = {
    tenantId: req.tenant!.id,
    deletedAt: null,
    status: p.status,
    ...(p.q ? { title: { contains: p.q, mode: 'insensitive' as const } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.course.findMany({ where, orderBy: { updatedAt: 'desc' }, ...pageArgs(p), include: { _count: { select: { lessons: true, enrollments: true } } } }),
    prisma.course.count({ where }),
  ]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
});

const courseMeta = z.object({
  title: z.string().trim().min(2).max(150),
  subtitle: z.string().trim().max(250).nullable().optional(),
  description: z.string().trim().max(20000).nullable().optional(),
  coverUrl: safeUrl.nullable().optional(),
  category: z.string().trim().max(60).nullable().optional(),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced', 'All levels']).nullable().optional(),
  dripMode: z.enum(['NONE', 'SEQUENTIAL', 'DAYS_AFTER_ENROLLMENT', 'FIXED_DATE']).optional(),
  certificateEnabled: z.boolean().optional(),
});

coursesRouter.post('/', can('courses.write'), async (req, res) => {
  const input = body(req, courseMeta.extend({ slug: slug.optional() }));
  const tenantId = req.tenant!.id;
  await assertWithinLimit(tenantId, 'maxCourses', await prisma.course.count({ where: { tenantId, deletedAt: null } }));
  const s = input.slug ?? slugify(input.title);
  try {
    const course = await prisma.$transaction(async (tx) => {
      const c = await tx.course.create({ data: { ...input, slug: s, tenantId, createdById: req.user!.id } });
      await tx.courseInstructor.create({ data: { courseId: c.id, userId: req.user!.id } });
      await tx.courseModule.create({ data: { tenantId, courseId: c.id, title: 'Module 1', position: 0 } });
      return c;
    });
    await audit({ action: 'course.create', entityType: 'course', entityId: course.id, req });
    res.status(201).json({ course });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('A course with this URL already exists');
    throw e;
  }
});

coursesRouter.get('/:courseId', can('courses.read'), async (req, res) => {
  const course = await loadCourse(req.tenant!.id, parse(id, req.params.courseId));
  const modules = await prisma.courseModule.findMany({
    where: { courseId: course.id },
    orderBy: { position: 'asc' },
    include: {
      lessons: {
        orderBy: { position: 'asc' },
        include: { quiz: { include: { questions: { orderBy: { position: 'asc' } } } }, assignment: true, resources: true },
      },
    },
  });
  const [enrollments, completed] = await Promise.all([
    prisma.enrollment.count({ where: { courseId: course.id, status: { not: 'REVOKED' } } }),
    prisma.enrollment.count({ where: { courseId: course.id, status: 'COMPLETED' } }),
  ]);
  const products = await prisma.product.findMany({
    where: { tenantId: req.tenant!.id, deletedAt: null, items: { some: { resourceType: 'COURSE', resourceId: course.id } } },
    select: { id: true, title: true, status: true, slug: true },
  });
  res.json({ course, modules, stats: { enrollments, completed }, products });
});

coursesRouter.patch('/:courseId', can('courses.write'), async (req, res) => {
  const course = await loadCourse(req.tenant!.id, parse(id, req.params.courseId));
  const input = body(req, courseMeta.partial().extend({ slug: slug.optional() }));
  try {
    const updated = await prisma.course.update({ where: { id: course.id }, data: input });
    res.json({ course: updated });
  } catch (e) {
    if (isUniqueViolation(e)) throw conflict('A course with this URL already exists');
    throw e;
  }
});

/** Publishing state changes are validated and audited */
coursesRouter.post('/:courseId/status', can('courses.write'), async (req, res) => {
  const course = await loadCourse(req.tenant!.id, parse(id, req.params.courseId));
  const input = body(req, z.object({ status: z.enum(['DRAFT', 'SCHEDULED', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED']), publishAt: z.coerce.date().optional() }));
  if (input.status === 'PUBLISHED' || input.status === 'SCHEDULED') {
    const lessons = await prisma.lesson.count({ where: { courseId: course.id, published: true } });
    if (!lessons) throw badRequest('Add at least one published lesson before publishing');
  }
  if (input.status === 'SCHEDULED' && (!input.publishAt || input.publishAt <= new Date())) throw badRequest('Choose a future publish date');
  const updated = await prisma.course.update({
    where: { id: course.id },
    data: { status: input.status, publishAt: input.status === 'SCHEDULED' ? input.publishAt : input.status === 'PUBLISHED' ? (course.publishAt ?? new Date()) : course.publishAt },
  });
  await audit({ action: `course.${input.status.toLowerCase()}`, entityType: 'course', entityId: course.id, req });
  res.json({ course: updated });
});

coursesRouter.delete('/:courseId', can('courses.write'), async (req, res) => {
  const course = await loadCourse(req.tenant!.id, parse(id, req.params.courseId));
  const sold = await prisma.enrollment.count({ where: { courseId: course.id, status: { not: 'REVOKED' } } });
  if (sold) throw badRequest(`${sold} student(s) are enrolled. Archive the course instead of deleting it.`);
  await prisma.course.update({ where: { id: course.id }, data: { deletedAt: new Date(), status: 'ARCHIVED', slug: `${course.slug}-deleted-${Date.now()}` } });
  await audit({ action: 'course.delete', entityType: 'course', entityId: course.id, req });
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Curriculum: modules & lessons
// ---------------------------------------------------------------------------

coursesRouter.post('/:courseId/modules', can('courses.write'), async (req, res) => {
  const course = await loadCourse(req.tenant!.id, parse(id, req.params.courseId));
  const input = body(req, z.object({ title: z.string().trim().min(1).max(150) }));
  const last = await prisma.courseModule.aggregate({ where: { courseId: course.id }, _max: { position: true } });
  const mod = await prisma.courseModule.create({ data: { tenantId: req.tenant!.id, courseId: course.id, title: input.title, position: (last._max.position ?? -1) + 1 } });
  res.status(201).json({ module: mod });
});

coursesRouter.patch('/modules/:moduleId', can('courses.write'), async (req, res) => {
  const mod = await loadModule(req.tenant!.id, parse(id, req.params.moduleId));
  const input = body(req, z.object({ title: z.string().trim().min(1).max(150) }));
  res.json({ module: await prisma.courseModule.update({ where: { id: mod.id }, data: input }) });
});

coursesRouter.delete('/modules/:moduleId', can('courses.write'), async (req, res) => {
  const mod = await loadModule(req.tenant!.id, parse(id, req.params.moduleId));
  const count = await prisma.courseModule.count({ where: { courseId: mod.courseId } });
  if (count <= 1) throw badRequest('A course needs at least one module');
  await prisma.courseModule.delete({ where: { id: mod.id } });
  res.json({ ok: true });
});

const lessonSchema = z.object({
  title: z.string().trim().min(1).max(200),
  type: z.enum(['VIDEO', 'AUDIO', 'TEXT', 'PDF', 'EMBED', 'QUIZ', 'ASSIGNMENT']),
  body: z.string().max(100000).nullable().optional(),
  embedUrl: z
    .string()
    .regex(/^https:\/\/(www\.youtube\.com\/embed\/|player\.vimeo\.com\/video\/|www\.loom\.com\/embed\/|docs\.google\.com\/)/, 'Use a YouTube, Vimeo, Loom or Google Docs embed URL')
    .nullable()
    .optional(),
  mediaAssetId: z.string().uuid().nullable().optional(),
  durationSec: z.number().int().min(0).max(86400).nullable().optional(),
  isPreview: z.boolean().optional(),
  published: z.boolean().optional(),
  dripDays: z.number().int().min(0).max(3650).nullable().optional(),
  availableAt: z.coerce.date().nullable().optional(),
});

coursesRouter.post('/modules/:moduleId/lessons', can('courses.write'), async (req, res) => {
  const mod = await loadModule(req.tenant!.id, parse(id, req.params.moduleId));
  const input = body(req, lessonSchema);
  await assertOwnAsset(req.tenant!.id, input.mediaAssetId);
  const last = await prisma.lesson.aggregate({ where: { moduleId: mod.id }, _max: { position: true } });
  const lesson = await prisma.lesson.create({
    data: { ...input, tenantId: req.tenant!.id, courseId: mod.courseId, moduleId: mod.id, position: (last._max.position ?? -1) + 1 },
  });
  if (input.type === 'ASSIGNMENT') await prisma.assignment.create({ data: { tenantId: req.tenant!.id, lessonId: lesson.id, instructions: input.body ?? 'Submit your work below.' } });
  res.status(201).json({ lesson });
});

coursesRouter.patch('/lessons/:lessonId', can('courses.write'), async (req, res) => {
  const lesson = await loadLesson(req.tenant!.id, parse(id, req.params.lessonId));
  const input = body(req, lessonSchema.partial());
  await assertOwnAsset(req.tenant!.id, input.mediaAssetId);
  const updated = await prisma.lesson.update({ where: { id: lesson.id }, data: input });
  if (updated.type === 'ASSIGNMENT') {
    await prisma.assignment.upsert({
      where: { lessonId: lesson.id },
      create: { tenantId: req.tenant!.id, lessonId: lesson.id, instructions: updated.body ?? 'Submit your work below.' },
      update: { instructions: updated.body ?? undefined },
    });
  }
  res.json({ lesson: updated });
});

coursesRouter.delete('/lessons/:lessonId', can('courses.write'), async (req, res) => {
  const lesson = await loadLesson(req.tenant!.id, parse(id, req.params.lessonId));
  await prisma.lesson.delete({ where: { id: lesson.id } });
  res.json({ ok: true });
});

coursesRouter.post('/lessons/:lessonId/resources', can('courses.write'), async (req, res) => {
  const lesson = await loadLesson(req.tenant!.id, parse(id, req.params.lessonId));
  const input = body(req, z.object({ mediaAssetId: z.string().uuid(), title: z.string().trim().min(1).max(150) }));
  await assertOwnAsset(req.tenant!.id, input.mediaAssetId);
  res.status(201).json({ resource: await prisma.lessonResource.create({ data: { lessonId: lesson.id, ...input } }) });
});

coursesRouter.delete('/lessons/:lessonId/resources/:resourceId', can('courses.write'), async (req, res) => {
  const lesson = await loadLesson(req.tenant!.id, parse(id, req.params.lessonId));
  await prisma.lessonResource.deleteMany({ where: { id: parse(id, req.params.resourceId), lessonId: lesson.id } });
  res.json({ ok: true });
});

/**
 * Reorder modules and lessons (including moving lessons between modules) in one
 * request. Every id must belong to this course, and every lesson must be listed once.
 */
coursesRouter.put('/:courseId/curriculum/order', can('courses.write'), async (req, res) => {
  const course = await loadCourse(req.tenant!.id, parse(id, req.params.courseId));
  const input = body(req, z.object({ modules: z.array(z.object({ id: z.string().uuid(), lessonIds: z.array(z.string().uuid()) })).min(1) }));
  const [mods, lessons] = await Promise.all([
    prisma.courseModule.findMany({ where: { courseId: course.id }, select: { id: true } }),
    prisma.lesson.findMany({ where: { courseId: course.id }, select: { id: true } }),
  ]);
  const modIds = new Set(mods.map((m) => m.id));
  const lessonIds = new Set(lessons.map((l) => l.id));
  const sentLessons = input.modules.flatMap((m) => m.lessonIds);
  if (input.modules.length !== modIds.size || !input.modules.every((m) => modIds.has(m.id))) throw badRequest('Module list does not match this course');
  if (sentLessons.length !== lessonIds.size || new Set(sentLessons).size !== sentLessons.length || !sentLessons.every((l) => lessonIds.has(l))) {
    throw badRequest('Lesson list does not match this course');
  }
  await prisma.$transaction([
    ...input.modules.map((m, i) => prisma.courseModule.update({ where: { id: m.id }, data: { position: i } })),
    ...input.modules.flatMap((m) => m.lessonIds.map((l, i) => prisma.lesson.update({ where: { id: l }, data: { moduleId: m.id, position: i } }))),
  ]);
  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------

coursesRouter.put('/lessons/:lessonId/quiz', can('courses.write'), async (req, res) => {
  const lesson = await loadLesson(req.tenant!.id, parse(id, req.params.lessonId));
  if (lesson.type !== 'QUIZ') throw badRequest('This lesson is not a quiz');
  const input = body(
    req,
    z.object({
      passPct: z.number().int().min(0).max(100),
      questions: z
        .array(
          z
            .object({
              prompt: z.string().trim().min(1).max(1000),
              type: z.enum(['SINGLE', 'MULTIPLE']),
              options: z.array(z.string().trim().min(1).max(300)).min(2).max(8),
              correct: z.array(z.number().int().min(0)).min(1),
              points: z.number().int().min(1).max(100).default(1),
            })
            .refine((q) => q.correct.every((c) => c < q.options.length), 'Correct answer must be one of the options')
            .refine((q) => q.type === 'MULTIPLE' || q.correct.length === 1, 'Single-choice questions have exactly one correct answer'),
        )
        .min(1)
        .max(100),
    }),
  );
  const quiz = await prisma.$transaction(async (tx) => {
    const q = await tx.quiz.upsert({ where: { lessonId: lesson.id }, create: { tenantId: req.tenant!.id, lessonId: lesson.id, passPct: input.passPct }, update: { passPct: input.passPct } });
    await tx.question.deleteMany({ where: { quizId: q.id } });
    await tx.question.createMany({ data: input.questions.map((qq, i) => ({ ...qq, quizId: q.id, position: i })) });
    return tx.quiz.findUniqueOrThrow({ where: { id: q.id }, include: { questions: { orderBy: { position: 'asc' } } } });
  });
  res.json({ quiz });
});

// ---------------------------------------------------------------------------
// Students, manual enrollment, assignment grading
// ---------------------------------------------------------------------------

coursesRouter.get('/:courseId/students', can('courses.read', 'customers.read'), async (req, res) => {
  const course = await loadCourse(req.tenant!.id, parse(id, req.params.courseId));
  const p = query(req, pagination);
  const where = {
    courseId: course.id,
    ...(p.q ? { user: { OR: [{ name: { contains: p.q, mode: 'insensitive' as const } }, { email: { contains: p.q, mode: 'insensitive' as const } }] } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.enrollment.findMany({ where, orderBy: { enrolledAt: 'desc' }, ...pageArgs(p), include: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.enrollment.count({ where }),
  ]);
  res.json({ items, total, page: p.page, pageSize: p.pageSize });
});

coursesRouter.post('/:courseId/enroll', can('courses.write', 'customers.write'), async (req, res) => {
  const course = await loadCourse(req.tenant!.id, parse(id, req.params.courseId));
  const input = body(req, z.object({ email, name: z.string().trim().min(1).max(100).optional() }));
  const tenantId = req.tenant!.id;
  let user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user) user = await prisma.user.create({ data: { email: input.email, name: input.name ?? input.email.split('@')[0] } });
  await prisma.$transaction(async (tx) => {
    await grantEntitlement(tx, { tenantId, userId: user!.id, resourceType: 'COURSE', resourceId: course.id, sourceType: 'MANUAL', sourceId: req.user!.id });
    await upsertContact(tx, tenantId, { email: user!.email, name: user!.name, userId: user!.id, source: 'manual_enrollment' });
    await audit({ action: 'course.enroll_manual', entityType: 'course', entityId: course.id, metadata: { email: input.email }, req }, tx);
  });
  res.status(201).json({ ok: true });
});

coursesRouter.delete('/:courseId/students/:userId', can('courses.write', 'customers.write'), async (req, res) => {
  const course = await loadCourse(req.tenant!.id, parse(id, req.params.courseId));
  const userId = parse(id, req.params.userId);
  await prisma.$transaction(async (tx) => {
    await revokeEntitlement(tx, { tenantId: req.tenant!.id, userId, resourceType: 'COURSE', resourceId: course.id, sourceType: 'MANUAL' });
    await audit({ action: 'course.unenroll_manual', entityType: 'course', entityId: course.id, metadata: { userId }, req }, tx);
  });
  res.json({ ok: true });
});

coursesRouter.get('/:courseId/submissions', can('courses.read'), async (req, res) => {
  const course = await loadCourse(req.tenant!.id, parse(id, req.params.courseId));
  const status = parse(z.enum(['SUBMITTED', 'GRADED', 'RETURNED']).optional(), req.query.status);
  const items = await prisma.assignmentSubmission.findMany({
    where: { status, assignment: { lesson: { courseId: course.id } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { assignment: { include: { lesson: { select: { id: true, title: true } } } } },
  });
  const users = await prisma.user.findMany({ where: { id: { in: items.map((i) => i.userId) } }, select: { id: true, name: true, email: true } });
  res.json({ items: items.map((i) => ({ ...i, user: users.find((u) => u.id === i.userId) })) });
});

coursesRouter.patch('/submissions/:submissionId', can('courses.write'), async (req, res) => {
  const sid = parse(id, req.params.submissionId);
  const sub = await prisma.assignmentSubmission.findFirst({ where: { id: sid, assignment: { tenantId: req.tenant!.id } }, include: { assignment: true } });
  if (!sub) throw notFound('Submission not found');
  const input = body(req, z.object({ score: z.number().int().min(0), feedback: z.string().trim().max(5000).optional(), status: z.enum(['GRADED', 'RETURNED']).default('GRADED') }));
  if (input.score > sub.assignment.maxScore) throw badRequest(`Score cannot exceed ${sub.assignment.maxScore}`);
  const updated = await prisma.assignmentSubmission.update({ where: { id: sid }, data: { ...input, gradedById: req.user!.id } });
  await prisma.notification.create({
    data: { tenantId: req.tenant!.id, userId: sub.userId, type: 'assignment.graded', title: 'Your assignment was reviewed', body: `Score: ${input.score}/${sub.assignment.maxScore}` },
  });
  res.json({ submission: updated });
});
