export interface CourseDto {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  description: string | null;
  durationWeeks: number | null;
  totalHours: number | null;
  price: number | null;
  isActive: boolean;
  createdAt: Date;
  levels?: CourseLevelDto[];
}

export interface CourseLevelDto {
  id: string;
  courseId: string;
  name: string;
  code: string | null;
  description: string | null;
  order: number;
  durationWeeks: number | null;
  totalHours: number | null;
  isActive: boolean;
  subjects?: SubjectDto[];
}

export interface SubjectDto {
  id: string;
  courseLevelId: string;
  name: string;
  code: string | null;
  description: string | null;
  hoursRequired: number | null;
  order: number;
  isActive: boolean;
}

export interface CreateCourseInput {
  organizationId: string;
  name: string;
  code?: string;
  description?: string;
  durationWeeks?: number;
  totalHours?: number;
  price?: number;
}

export interface CreateCourseLevelInput {
  courseId: string;
  name: string;
  code?: string;
  description?: string;
  order?: number;
  durationWeeks?: number;
  totalHours?: number;
}

export interface CreateSubjectInput {
  courseLevelId: string;
  name: string;
  code?: string;
  description?: string;
  hoursRequired?: number;
  order?: number;
}
