import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { FileDown, Info } from "lucide-react";

const COLUMNS = [
  { name: "firstName", required: true },
  { name: "lastName", required: true },
  { name: "gender", required: false },
  { name: "birthDate", required: false },
  { name: "phone", required: false },
  { name: "email", required: false },
  { name: "documentType", required: false },
  { name: "documentNumber", required: false },
  { name: "address", required: false },
];

export function ImportInstructionsCard() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Instruções</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Descarregue o modelo, preencha uma linha por aluno e faça o carregamento do ficheiro
          preenchido. Formatos suportados: CSV ou XLSX, até 10 MB e 5000 linhas. As datas de
          nascimento devem usar o formato AAAA-MM-DD ou DD/MM/AAAA.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {COLUMNS.map((col) => (
            <span
              key={col.name}
              className="rounded-md border bg-muted/50 px-2 py-1 text-xs font-mono"
            >
              {col.name}
              {col.required && <span className="text-destructive">*</span>}
            </span>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button asChild size="sm" variant="outline">
            <a href="/api/students/import/template?format=csv" download>
              <FileDown className="size-4 mr-1.5" />
              Modelo CSV
            </a>
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href="/api/students/import/template?format=xlsx" download>
              <FileDown className="size-4 mr-1.5" />
              Modelo XLSX
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
