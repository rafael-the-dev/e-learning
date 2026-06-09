"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { ConfirmDialog } from "@/shared/components/feedback/confirm-dialog";
import { toast } from "@/shared/hooks/use-toast";
import {
  addClassroomFeatureAction,
  removeClassroomFeatureAction,
} from "@/modules/classrooms/actions/classroom-feature.actions";
import { CLASSROOM_FEATURE_LABELS, type ClassroomFeature } from "@/modules/classrooms/types";
import { X, Plus } from "lucide-react";

interface ClassroomFeaturePanelProps {
  classroomId: string;
  features: ClassroomFeature[];
  canManage: boolean;
}

const ALL_FEATURES = Object.keys(CLASSROOM_FEATURE_LABELS) as Array<keyof typeof CLASSROOM_FEATURE_LABELS>;

export function ClassroomFeaturePanel({ classroomId, features, canManage }: ClassroomFeaturePanelProps) {
  const router = useRouter();
  const [selectedFeature, setSelectedFeature] = React.useState("");
  const [removeTarget, setRemoveTarget] = React.useState<ClassroomFeature | null>(null);
  const [isProcessing, setIsProcessing] = React.useState(false);

  const existingFeatureTypes = new Set(features.map((f) => f.feature));
  const availableFeatures = ALL_FEATURES.filter((f) => !existingFeatureTypes.has(f));

  async function handleAdd() {
    if (!selectedFeature) return;
    setIsProcessing(true);
    const res = await addClassroomFeatureAction({ classroomId, feature: selectedFeature as never });
    setIsProcessing(false);
    if (res.success) {
      toast.success("Funcionalidade adicionada");
      setSelectedFeature("");
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  async function handleRemove() {
    if (!removeTarget) return;
    setIsProcessing(true);
    const res = await removeClassroomFeatureAction({ featureId: removeTarget.id, classroomId });
    setIsProcessing(false);
    if (res.success) {
      toast.success("Funcionalidade removida");
      setRemoveTarget(null);
      router.refresh();
    } else {
      toast.error(res.error);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {features.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma funcionalidade registada.</p>
        )}
        {features.map((f) => (
          <Badge key={f.id} variant="secondary" className="flex items-center gap-1.5 pr-1">
            {CLASSROOM_FEATURE_LABELS[f.feature] ?? f.feature}
            {canManage && (
              <button
                onClick={() => setRemoveTarget(f)}
                className="ml-1 rounded-sm hover:bg-muted"
                aria-label="Remover"
              >
                <X className="size-3" />
              </button>
            )}
          </Badge>
        ))}
      </div>

      {canManage && availableFeatures.length > 0 && (
        <div className="flex gap-2 items-center">
          <Select value={selectedFeature} onValueChange={setSelectedFeature}>
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Adicionar funcionalidade..." />
            </SelectTrigger>
            <SelectContent>
              {availableFeatures.map((f) => (
                <SelectItem key={f} value={f}>
                  {CLASSROOM_FEATURE_LABELS[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!selectedFeature || isProcessing}
            onClick={handleAdd}
          >
            <Plus className="size-4 mr-1.5" />
            Adicionar
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Remover Funcionalidade"
        description={`Tem a certeza que pretende remover "${CLASSROOM_FEATURE_LABELS[removeTarget?.feature ?? ""] ?? removeTarget?.feature}"?`}
        confirmLabel="Remover"
        variant="destructive"
        loading={isProcessing}
        onConfirm={handleRemove}
      />
    </div>
  );
}
