import Link from "next/link";
import { UserPlus, ClipboardList, CreditCard, FileText, CalendarPlus, ClipboardCheck } from "lucide-react";
import { cn } from "@/shared/lib/utils";

interface QuickAction {
  key: string;
  href: string;
  label: string;
  icon: React.ReactNode;
  allowed: boolean;
}

interface Props {
  canCreateEnrollments: boolean;
  canCreateStudents: boolean;
  canCreatePayments: boolean;
  canCreateInvoices: boolean;
  canCreateClassGroups: boolean;
  canCreateAssessments: boolean;
}

export function DashboardQuickActions(props: Props) {
  const actions: QuickAction[] = [
    { key: "enrollment", href: "/enrollments/new", label: "Nova Matrícula", icon: <ClipboardList className="size-5" />, allowed: props.canCreateEnrollments },
    { key: "student", href: "/students/new", label: "Novo Aluno", icon: <UserPlus className="size-5" />, allowed: props.canCreateStudents },
    { key: "payment", href: "/payments/new", label: "Novo Pagamento", icon: <CreditCard className="size-5" />, allowed: props.canCreatePayments },
    { key: "invoice", href: "/invoices/new", label: "Nova Factura", icon: <FileText className="size-5" />, allowed: props.canCreateInvoices },
    { key: "classGroup", href: "/class-groups/new", label: "Nova Turma", icon: <CalendarPlus className="size-5" />, allowed: props.canCreateClassGroups },
    { key: "assessment", href: "/assessments/new", label: "Nova Avaliação", icon: <ClipboardCheck className="size-5" />, allowed: props.canCreateAssessments },
  ];

  const visible = actions.filter((a) => a.allowed);
  if (visible.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {visible.map((action) => (
        <Link
          key={action.key}
          href={action.href}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-xl border bg-card p-4 text-center transition-colors hover:bg-muted/60 hover:border-primary/40"
          )}
        >
          <span className="rounded-lg bg-primary/10 p-2 text-primary">{action.icon}</span>
          <span className="text-xs font-medium">{action.label}</span>
        </Link>
      ))}
    </div>
  );
}
