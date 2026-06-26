"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { toast } from "@/shared/hooks/use-toast";
import { createAttendanceSessionAction } from "@/modules/attendance/actions/attendance.actions";

interface ClassGroupOption {
  id: string;
  name: string;
  courseId: string;
  courseLevelId: string | null;
  academicYearId: string;
  academicTermId: string | null;
  course: { id: string; name: string };
  courseLevel: { id: string; name: string } | null;
}

interface TeacherOption {
  id: string;
  firstName: string;
  lastName: string;
}

interface ClassroomOption {
  id: string;
  name: string;
  code: string | null;
}

interface AcademicYearOption {
  id: string;
  name: string;
  status: string;
}

interface LevelSubjectOption {
  id: string;
  subjectId: string;
  minimumAttendancePercentage: number | { toNumber(): number } | null;
  subject: { id: string; name: string };
}

interface CreateSessionFormProps {
  academicYears: AcademicYearOption[];
  classGroups: ClassGroupOption[];
  teachers: TeacherOption[];
  classrooms: ClassroomOption[];
  getLevelSubjects: (courseLevelId: string) => Promise<LevelSubjectOption[]>;
  /**
   * When set (teacher-scoped user), the assigned teacher is locked to this id:
   * the selector is replaced by read-only text and the value is forced to self.
   * The server also forces it, so this is UX only. Undefined for admins/secretaries.
   */
  assignedTeacherLockedId?: string;
}

const NONE = "__none__";

export function CreateSessionForm({
  academicYears,
  classGroups,
  teachers,
  classrooms,
  getLevelSubjects,
  assignedTeacherLockedId,
}: CreateSessionFormProps) {
  const router = useRouter();
  const [classGroupId, setClassGroupId] = React.useState("");
  const [levelSubjectId, setLevelSubjectId] = React.useState("");
  const [teacherId, setTeacherId] = React.useState(assignedTeacherLockedId ?? NONE);
  const [classroomId, setClassroomId] = React.useState(NONE);
  const [sessionDate, setSessionDate] = React.useState("");
  const [startTime, setStartTime] = React.useState("");
  const [endTime, setEndTime] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [levelSubjects, setLevelSubjects] = React.useState<LevelSubjectOption[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [loadingSubjects, setLoadingSubjects] = React.useState(false);

  const selectedClassGroup = classGroups.find((g) => g.id === classGroupId);

  async function handleClassGroupChange(id: string) {
    setClassGroupId(id);
    setLevelSubjectId("");
    const group = classGroups.find((g) => g.id === id);
    if (!group?.courseLevelId) return;
    setLoadingSubjects(true);
    const subjects = await getLevelSubjects(group.courseLevelId);
    setLevelSubjects(subjects);
    setLoadingSubjects(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!classGroupId || !levelSubjectId || !sessionDate || !startTime || !endTime) {
      toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
      return;
    }
    const group = classGroups.find((g) => g.id === classGroupId);
    if (!group?.courseLevelId) return;
    const ls = levelSubjects.find((s) => s.id === levelSubjectId);
    if (!ls) return;

    setLoading(true);
    const res = await createAttendanceSessionAction({
      academicYearId: group.academicYearId,
      academicTermId: group.academicTermId ?? undefined,
      classGroupId,
      courseId: group.courseId,
      courseLevelId: group.courseLevelId,
      subjectId: ls.subjectId,
      levelSubjectId,
      teacherId: teacherId !== NONE ? teacherId : undefined,
      classroomId: classroomId !== NONE ? classroomId : undefined,
      sessionDate,
      startTime,
      endTime,
      title: title || undefined,
      notes: notes || undefined,
    });
    setLoading(false);

    if (res.success) {
      toast({ title: "Sessão criada com sucesso" });
      router.push(`/attendance/sessions/${res.data.id}`);
    } else {
      toast({ title: "Erro ao criar sessão", description: res.error, variant: "destructive" });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-2xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <Label htmlFor="classGroupId">Turma *</Label>
          <Select value={classGroupId} onValueChange={handleClassGroupChange}>
            <SelectTrigger id="classGroupId" className="mt-1.5">
              <SelectValue placeholder="Selecionar turma..." />
            </SelectTrigger>
            <SelectContent>
              {classGroups.map((g) => (
                <SelectItem key={g.id} value={g.id}>
                  {g.name} — {g.course.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="levelSubjectId">Disciplina *</Label>
          <Select
            value={levelSubjectId}
            onValueChange={setLevelSubjectId}
            disabled={!classGroupId || loadingSubjects}
          >
            <SelectTrigger id="levelSubjectId" className="mt-1.5">
              <SelectValue
                placeholder={loadingSubjects ? "A carregar..." : "Selecionar disciplina..."}
              />
            </SelectTrigger>
            <SelectContent>
              {levelSubjects.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.subject.name}
                  {s.minimumAttendancePercentage != null
                    ? ` (mín. ${typeof s.minimumAttendancePercentage === "number" ? s.minimumAttendancePercentage : (s.minimumAttendancePercentage as any).toNumber()}%)`
                    : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label htmlFor="sessionDate">Data da Sessão *</Label>
          <Input
            id="sessionDate"
            type="date"
            value={sessionDate}
            onChange={(e) => setSessionDate(e.target.value)}
            className="mt-1.5"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor="startTime">Início *</Label>
            <Input
              id="startTime"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="endTime">Fim *</Label>
            <Input
              id="endTime"
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="mt-1.5"
            />
          </div>
        </div>

        <div>
          <Label htmlFor="teacherId">Professor</Label>
          {assignedTeacherLockedId ? (
            // Teacher-scoped: assigned teacher is always the current teacher.
            <p className="mt-1.5 text-sm text-muted-foreground">
              Professor atribuído: você
            </p>
          ) : (
            <Select value={teacherId} onValueChange={setTeacherId}>
              <SelectTrigger id="teacherId" className="mt-1.5">
                <SelectValue placeholder="Nenhum" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Nenhum</SelectItem>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.firstName} {t.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div>
          <Label htmlFor="classroomId">Sala</Label>
          <Select value={classroomId} onValueChange={setClassroomId}>
            <SelectTrigger id="classroomId" className="mt-1.5">
              <SelectValue placeholder="Nenhuma" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Nenhuma</SelectItem>
              {classrooms.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}{c.code ? ` (${c.code})` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="title">Título (opcional)</Label>
          <Input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Título da sessão..."
            className="mt-1.5"
          />
        </div>

        <div className="sm:col-span-2">
          <Label htmlFor="notes">Notas (opcional)</Label>
          <Textarea
            id="notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notas adicionais..."
            className="mt-1.5"
            rows={3}
          />
        </div>
      </div>

      <div className="flex gap-3">
        <Button type="submit" disabled={loading}>
          {loading ? "A criar..." : "Criar Sessão"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/attendance/sessions")}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
