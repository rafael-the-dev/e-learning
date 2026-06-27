import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { CalendarCheck } from "lucide-react";
import { ATTENDANCE_STATUS_LABELS } from "@/modules/student-portal/types";
import type {
  StudentAttendanceKpis,
  StudentAttendanceMonthlyPoint,
  StudentAttendanceSessionRow,
} from "@/modules/student-portal/types";

interface Props {
  kpis: StudentAttendanceKpis;
  trend: StudentAttendanceMonthlyPoint[];
  sessions: StudentAttendanceSessionRow[];
}

const STATUS_BADGE: Record<string, "success" | "destructive" | "warning" | "secondary"> = {
  PRESENT: "success",
  REMOTE: "success",
  LATE: "warning",
  EXCUSED: "secondary",
  ABSENT: "destructive",
};

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

export function StudentAttendancePanel({ kpis, trend, sessions }: Props) {
  return (
    <Card id="frequencia" className="scroll-mt-20">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CalendarCheck className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Frequência</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <MiniStat label="Frequência" value={kpis.attendancePercentage != null ? `${kpis.attendancePercentage}%` : "—"} />
          <MiniStat label="Presenças" value={kpis.presentCount} />
          <MiniStat label="Faltas" value={kpis.absentCount} />
          <MiniStat label="Justificadas" value={kpis.justifiedCount} />
          <MiniStat label="Injustificadas" value={kpis.unjustifiedCount} />
        </div>

        {trend.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Evolução Mensal</p>
            <div className="flex items-end gap-2">
              {trend.map((point) => (
                <div key={point.month} className="flex flex-1 flex-col items-center gap-1">
                  <div className="flex h-20 w-full items-end">
                    <div
                      className="w-full rounded-t bg-primary/80"
                      style={{ height: `${Math.max(point.attendancePercentage, 2)}%` }}
                      title={`${point.attendancePercentage}%`}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground">{point.month.slice(5)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {sessions.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck className="size-8" />}
            title="Sem registos de presença."
            className="border-0"
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Disciplina</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap">{s.sessionDate.toLocaleDateString("pt-PT")}</TableCell>
                    <TableCell>{s.subjectName}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGE[s.status] ?? "secondary"}>
                        {ATTENDANCE_STATUS_LABELS[s.status] ?? s.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
