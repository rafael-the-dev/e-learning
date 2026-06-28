import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Badge } from "@/shared/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/shared/components/ui/table";
import { EmptyState } from "@/shared/components/layout/empty-state";
import { Inbox, ListChecks } from "lucide-react";
import { formatCurrency } from "@/shared/lib/utils";
import {
  ENROLLMENT_STATUS_LABELS,
  INVOICE_STATUS_LABELS,
  STUDENT_DOCUMENT_TYPE_LABELS,
} from "@/modules/secretary-portal/types";
import type { SecretaryOperationalQueues } from "@/modules/secretary-portal/types";

interface Props {
  queues: SecretaryOperationalQueues;
}

const ENROLLMENT_BADGE: Record<string, "warning" | "secondary"> = {
  DRAFT: "secondary",
  PENDING_PAYMENT: "warning",
};

function formatDate(date: Date | null): string {
  return date ? new Date(date).toLocaleDateString("pt-PT") : "—";
}

export function SecretaryOperationalQueues({ queues }: Props) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ListChecks className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Filas Operacionais</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="enrollments">
          <TabsList className="mb-4 flex flex-wrap">
            <TabsTrigger value="enrollments">Matrículas ({queues.pendingEnrollments.length})</TabsTrigger>
            <TabsTrigger value="invoices">Pagamentos ({queues.attentionInvoices.length})</TabsTrigger>
            <TabsTrigger value="documents">Documentos ({queues.documentsToReview.length})</TabsTrigger>
            <TabsTrigger value="students">Alunos Recentes ({queues.recentStudents.length})</TabsTrigger>
          </TabsList>

          {/* A — Pending enrollments */}
          <TabsContent value="enrollments">
            {queues.pendingEnrollments.length === 0 ? (
              <EmptyState icon={<Inbox className="size-8" />} title="Sem matrículas pendentes." className="border-0" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Nº</TableHead>
                      <TableHead>Curso</TableHead>
                      <TableHead>Nível</TableHead>
                      <TableHead>Turma</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Criada</TableHead>
                      <TableHead className="text-right">Acção</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queues.pendingEnrollments.map((row) => (
                      <TableRow key={row.enrollmentId}>
                        <TableCell className="font-medium">{row.studentName}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.enrollmentNumber ?? "—"}</TableCell>
                        <TableCell>{row.courseName}</TableCell>
                        <TableCell>{row.levelName ?? "—"}</TableCell>
                        <TableCell>{row.classGroupName ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={ENROLLMENT_BADGE[row.status] ?? "secondary"}>
                            {ENROLLMENT_STATUS_LABELS[row.status] ?? row.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(row.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/enrollments/${row.enrollmentId}`} className="text-xs font-medium text-primary hover:underline">
                            Abrir
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* B — Payments / invoices needing attention */}
          <TabsContent value="invoices">
            {queues.attentionInvoices.length === 0 ? (
              <EmptyState icon={<Inbox className="size-8" />} title="Sem facturas vencidas." className="border-0" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Factura</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Em Dívida</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Vencimento</TableHead>
                      <TableHead className="text-right">Acção</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queues.attentionInvoices.map((row) => (
                      <TableRow key={row.invoiceId}>
                        <TableCell className="font-medium">{row.studentName}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.invoiceNumber}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.totalAmount)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(row.balanceAmount)}</TableCell>
                        <TableCell>
                          <Badge variant="destructive">{INVOICE_STATUS_LABELS[row.status] ?? row.status}</Badge>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(row.dueDate)}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/invoices/${row.invoiceId}`} className="text-xs font-medium text-primary hover:underline">
                            Abrir
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* C — Documents pending review */}
          <TabsContent value="documents">
            {queues.documentsToReview.length === 0 ? (
              <EmptyState icon={<Inbox className="size-8" />} title="Sem documentos por rever." className="border-0" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Tipo de Documento</TableHead>
                      <TableHead className="text-right">Dias Pendente</TableHead>
                      <TableHead className="text-right">Acção</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queues.documentsToReview.map((row) => (
                      <TableRow key={row.documentId}>
                        <TableCell className="font-medium">{row.studentName}</TableCell>
                        <TableCell>{STUDENT_DOCUMENT_TYPE_LABELS[row.documentType] ?? row.documentType}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.daysPending}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/students/${row.studentId}`} className="text-xs font-medium text-primary hover:underline">
                            Abrir
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* D — Recent students */}
          <TabsContent value="students">
            {queues.recentStudents.length === 0 ? (
              <EmptyState icon={<Inbox className="size-8" />} title="Sem alunos recentes." className="border-0" />
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Contacto</TableHead>
                      <TableHead>Curso</TableHead>
                      <TableHead>Matrícula</TableHead>
                      <TableHead>Criado</TableHead>
                      <TableHead className="text-right">Acção</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {queues.recentStudents.map((row) => (
                      <TableRow key={row.studentId}>
                        <TableCell className="font-medium">{row.studentName}</TableCell>
                        <TableCell className="whitespace-nowrap">{row.contact ?? "—"}</TableCell>
                        <TableCell>{row.courseName ?? "—"}</TableCell>
                        <TableCell>
                          {row.enrollmentStatus ? (
                            <Badge variant="secondary">
                              {ENROLLMENT_STATUS_LABELS[row.enrollmentStatus] ?? row.enrollmentStatus}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(row.createdAt)}</TableCell>
                        <TableCell className="text-right">
                          <Link href={`/students/${row.studentId}`} className="text-xs font-medium text-primary hover:underline">
                            Abrir
                          </Link>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
