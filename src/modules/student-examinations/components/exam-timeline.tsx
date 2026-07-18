import { Check } from "lucide-react";
import { cn } from "@/shared/lib/utils";
import type { StudentExamTimelineDto } from "@/modules/student-examinations/types";

// 4-step visual progress: Inscrito → Elegível → Realizado → Resultado publicado.
// Presentational only — driven entirely by the booleans in the timeline DTO.

const STEPS: Array<{ key: keyof StudentExamTimelineDto; label: string }> = [
  { key: "registered", label: "Inscrito" },
  { key: "eligible", label: "Elegível" },
  { key: "sat", label: "Realizado" },
  { key: "resultPublished", label: "Resultado publicado" },
];

export function ExamTimeline({ timeline }: { timeline: StudentExamTimelineDto }) {
  return (
    <ol className="flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-0">
      {STEPS.map((step, index) => {
        const done = timeline[step.key];
        const isLast = index === STEPS.length - 1;
        return (
          <li key={step.key} className="flex flex-1 items-center gap-3 sm:flex-col sm:gap-2 sm:text-center">
            <div className="flex items-center gap-3 sm:w-full sm:flex-col sm:gap-2">
              <div className="flex items-center sm:w-full">
                {/* Left connector (desktop) */}
                <span className="hidden sm:block sm:flex-1" aria-hidden />
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                    done
                      ? "border-emerald-500 bg-emerald-100 text-emerald-700"
                      : "border-muted-foreground/30 bg-muted text-muted-foreground"
                  )}
                >
                  {done ? <Check className="size-4" /> : index + 1}
                </span>
                {/* Right connector (desktop) */}
                {!isLast ? (
                  <span
                    className={cn(
                      "hidden h-0.5 flex-1 sm:block",
                      done ? "bg-emerald-300" : "bg-muted-foreground/20"
                    )}
                    aria-hidden
                  />
                ) : (
                  <span className="hidden sm:block sm:flex-1" aria-hidden />
                )}
              </div>
              <span
                className={cn(
                  "text-sm font-medium",
                  done ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {step.label}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
