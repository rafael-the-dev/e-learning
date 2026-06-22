"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/shared/components/ui/card";
import { Button } from "@/shared/components/ui/button";
import { Label } from "@/shared/components/ui/label";
import { UploadCloud, FileSpreadsheet, Loader2 } from "lucide-react";

interface UploadCardProps {
  onSubmit: (file: File) => void;
  isValidating: boolean;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

export function UploadCard({ onSubmit, isValidating }: UploadCardProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [file, setFile] = React.useState<File | null>(null);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <UploadCloud className="size-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Carregar Ficheiro</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="import-file">Ficheiro CSV ou XLSX</Label>
          <input
            ref={inputRef}
            id="import-file"
            type="file"
            accept=".csv,.xlsx"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed p-6 text-left transition-colors hover:bg-muted/50"
          >
            <FileSpreadsheet className="size-8 shrink-0 text-muted-foreground" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium">
                {file ? file.name : "Clique para selecionar um ficheiro"}
              </p>
              <p className="text-xs text-muted-foreground">
                {file ? formatFileSize(file.size) : "Formatos suportados: .csv, .xlsx"}
              </p>
            </div>
          </button>
        </div>

        <Button
          size="sm"
          disabled={!file || isValidating}
          onClick={() => file && onSubmit(file)}
        >
          {isValidating && <Loader2 className="size-4 mr-1.5 animate-spin" />}
          {isValidating ? "A validar..." : "Validar Ficheiro"}
        </Button>
      </CardContent>
    </Card>
  );
}
