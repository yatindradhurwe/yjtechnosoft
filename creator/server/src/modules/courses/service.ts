import type { Course, Enrollment, Lesson, LessonProgress } from '@prisma/client';
import { prisma, Db } from '../../lib/prisma';

/** A course is live when published, or scheduled with a publish time in the past */
export function isCourseLive(c: Pick<Course, 'status' | 'publishAt' | 'deletedAt'>, now = new Date()) {
  if (c.deletedAt) return false;
  return c.status === 'PUBLISHED' || (c.status === 'SCHEDULED' && !!c.publishAt && c.publishAt <= now);
}

/** Lessons in curriculum order (module position, then lesson position) */
export async function orderedLessons(courseId: string, db: Db = prisma, onlyPublished = false) {
  const modules = await db.courseModule.findMany({
    where: { courseId },
    orderBy: { position: 'asc' },
    include: { lessons: { where: onlyPublished ? { published: true } : {}, orderBy: { position: 'asc' } } },
  });
  return { modules, lessons: modules.flatMap((m) => m.lessons) };
}

export type LockReason = null | 'previous_incomplete' | 'drip_days' | 'drip_date';

export interface UnlockState {
  locked: boolean;
  reason: LockReason;
  unlocksAt?: Date;
}

/**
 * Drip & prerequisite rules, evaluated on the server for every lesson request.
 *  SEQUENTIAL             – every earlier lesson must be completed
 *  DAYS_AFTER_ENROLLMENT  – lesson.dripDays after the enrollment date
 *  FIXED_DATE             – lesson.availableAt
 */
export function computeUnlocks(
  course: Pick<Course, 'dripMode'>,
  lessons: Pick<Lesson, 'id' | 'dripDays' | 'availableAt'>[],
  enrollment: Pick<Enrollment, 'enrolledAt'> | null,
  progress: Pick<LessonProgress, 'lessonId' | 'completedAt'>[],
  now = new Date(),
): Map<string, UnlockState> {
  const done = new Set(progress.filter((p) => p.completedAt).map((p) => p.lessonId));
  const out = new Map<string, UnlockState>();
  let allPreviousDone = true;
  for (const lesson of lessons) {
    let state: UnlockState = { locked: false, reason: null };
    if (course.dripMode === 'SEQUENTIAL' && !allPreviousDone) state = { locked: true, reason: 'previous_incomplete' };
    if (course.dripMode === 'DAYS_AFTER_ENROLLMENT' && lesson.dripDays && enrollment) {
      const at = new Date(enrollment.enrolledAt.getTime() + lesson.dripDays * 86400_000);
      if (at > now) state = { locked: true, reason: 'drip_days', unlocksAt: at };
    }
    if (course.dripMode === 'FIXED_DATE' && lesson.availableAt && lesson.availableAt > now) {
      state = { locked: true, reason: 'drip_date', unlocksAt: lesson.availableAt };
    }
    out.set(lesson.id, state);
    if (!done.has(lesson.id)) allPreviousDone = false;
  }
  return out;
}

/** Recalculate an enrollment's progress percentage after a lesson changes state */
export async function recalcProgress(enrollmentId: string, db: Db = prisma) {
  const enrollment = await db.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } });
  const [total, completed] = await Promise.all([
    db.lesson.count({ where: { courseId: enrollment.courseId, published: true } }),
    db.lessonProgress.count({ where: { enrollmentId, completedAt: { not: null }, lesson: { published: true } } }),
  ]);
  const pct = total ? Math.round((completed / total) * 100) : 0;
  const finished = total > 0 && completed >= total;
  return db.enrollment.update({
    where: { id: enrollmentId },
    data: {
      progressPct: pct,
      status: finished ? 'COMPLETED' : enrollment.status === 'REVOKED' ? 'REVOKED' : 'ACTIVE',
      completedAt: finished ? (enrollment.completedAt ?? new Date()) : null,
    },
  });
}

/** Ensure an Enrollment row exists for a user who is entitled to a course */
export async function ensureEnrollment(tenantId: string, courseId: string, userId: string, db: Db = prisma) {
  const existing = await db.enrollment.findUnique({ where: { courseId_userId: { courseId, userId } } });
  if (!existing) return db.enrollment.create({ data: { tenantId, courseId, userId } });
  if (existing.status === 'REVOKED') {
    return db.enrollment.update({ where: { id: existing.id }, data: { status: existing.completedAt ? 'COMPLETED' : 'ACTIVE' } });
  }
  return existing;
}
