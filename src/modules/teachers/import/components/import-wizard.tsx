"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Loader2, ClipboardCheck } from "lucide-react";
import { toast } from "@/shared/hooks/use-toast";
import { ImportInstructionsCard } from "@/modules/teachers/import/components/import-instructions-card";
import { UploadCard } from "@/modules/teachers/import/components/upload-card";
import { ValidationResults } from "@/modules/teachers/import/components/validation-results";
import { PreviewTable } from "@/modules/teachers/import/components/preview-table";
import { ImportSummary } from "@/modules/teachers/import/components/import-summary";
import type { ImportReport, ValidationResult } from "@/modules/teachers/import/types";

type WizardStep = "upload" | "preview" | "result";

interface ApiErrorBody {
  error?: string;
}

export function ImportWizard() {
  const router = useRouter();
  const [step, setStep] = React.useState<WizardStep>("upload");
  const [isValidating, setIsValidating] = React.useState(false);
  const [isImporting, setIsImporting] = React.useState(false);
  const [validationResult, setValidationResult] = React.useState<ValidationResult | null>(null);
  const [importReport, setImportReport] = React.useState<ImportReport | null>(null);

  async function handleValidate(file: File) {
    setIsValidating(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/teachers/import/validate", { method: "POST", body: formData });
      const body = (await res.json()) as ValidationResult & ApiErrorBody;
      if (!res.ok) {
        toast.error(body.error ?? "Erro ao validar o ficheiro");
        return;
      }
      setValidationResult(body);
      setStep("preview");
    } catch {
      toast.error("Erro ao validar o ficheiro");
    } finally {
      setIsValidating(false);
    }
  }

  async function handleExecute() {
    if (!validationResult) return;
    setIsImporting(true);
    try {
      const res = await fetch("/api/teachers/import/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: validationResult.jobId }),
      });
      const body = (await res.json()) as ImportReport & ApiErrorBody;
      if (!res.ok) {
        toast.error(body.error ?? "Erro ao importar os professores");
        return;
      }
      setImportReport(body);
      setStep("result");
      toast.success(`${body.importedCount} professor(es) importado(s) com sucesso`);
      router.refresh();
    } catch {
      toast.error("Erro ao importar os professores");
    } finally {
      setIsImporting(false);
    }
  }

  function handleReset() {
    setValidationResult(null);
    setImportReport(null);
    setStep("upload");
  }

  if (step === "result" && importReport) {
    return <ImportSummary report={importReport} onReset={handleReset} />;
  }

  if (step === "preview" && validationResult) {
    const canImport = validationResult.validRows + validationResult.warningRows > 0;
    return (
      <div className="space-y-6">
        <ValidationResults result={validationResult} />
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Pré-visualização</CardTitle>
          </CardHeader>
          <CardContent>
            <PreviewTable rows={validationResult.rows} />
          </CardContent>
        </Card>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={handleReset} disabled={isImporting}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleExecute} disabled={!canImport || isImporting}>
            {isImporting ? (
              <Loader2 className="size-4 mr-1.5 animate-spin" />
            ) : (
              <ClipboardCheck className="size-4 mr-1.5" />
            )}
            {isImporting ? "A importar..." : "Confirmar Importação"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ImportInstructionsCard />
      <UploadCard onSubmit={handleValidate} isValidating={isValidating} />
    </div>
  );
}
