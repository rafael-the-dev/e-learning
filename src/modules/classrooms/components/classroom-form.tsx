"use client";

import * as React from "react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/shared/components/ui/button";
import { Input } from "@/shared/components/ui/input";
import { Textarea } from "@/shared/components/ui/textarea";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/shared/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/shared/components/ui/select";
import { toast } from "@/shared/hooks/use-toast";
import { createClassroomAction, updateClassroomAction } from "@/modules/classrooms/actions/classroom.actions";
import {
  createClassroomSchema,
  type CreateClassroomSchema,
} from "@/modules/classrooms/schemas/classroom.schema";
import {
  CLASSROOM_TYPE_LABELS,
  CLASSROOM_STATUS_LABELS,
  MEETING_PROVIDER_LABELS,
  type Classroom,
} from "@/modules/classrooms/types";

interface ClassroomFormProps {
  classroom?: Classroom;
  branches: Array<{ id: string; name: string }>;
}

export function ClassroomForm({ classroom, branches }: ClassroomFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();

  const form = useForm<z.input<typeof createClassroomSchema>, unknown, CreateClassroomSchema>({
    resolver: zodResolver(createClassroomSchema),
    defaultValues: {
      branchId: classroom?.branchId ?? undefined,
      code: classroom?.code ?? "",
      name: classroom?.name ?? "",
      description: classroom?.description ?? "",
      classroomType: (classroom?.classroomType as CreateClassroomSchema["classroomType"]) ?? "STANDARD_ROOM",
      capacity: classroom?.capacity ?? 1,
      location: classroom?.location ?? "",
      floor: classroom?.floor ?? "",
      meetingProvider: (classroom?.meetingProvider as CreateClassroomSchema["meetingProvider"]) ?? undefined,
      meetingUrl: classroom?.meetingUrl ?? "",
      status: (classroom?.status as CreateClassroomSchema["status"]) ?? "ACTIVE",
    },
  });

  const classroomType = form.watch("classroomType");
  const isOnline = classroomType === "ONLINE_ROOM";

  function onSubmit(values: CreateClassroomSchema) {
    startTransition(async () => {
      const res = classroom
        ? await updateClassroomAction(classroom.id, values)
        : await createClassroomAction(values);

      if (res.success) {
        toast.success(classroom ? "Sala atualizada" : "Sala criada");
        router.push(res.data ? `/classrooms/${res.data.id}` : "/classrooms");
        router.refresh();
      } else {
        toast.error(res.error ?? "Erro ao guardar");
        if (res.fieldErrors) {
          Object.entries(res.fieldErrors).forEach(([field, messages]) => {
            form.setError(field as keyof CreateClassroomSchema, { message: messages[0] });
          });
        }
      }
    });
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="code"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Código</FormLabel>
                <FormControl>
                  <Input placeholder="EX: SALA-01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nome</FormLabel>
                <FormControl>
                  <Input placeholder="Nome da sala" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="classroomType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Tipo</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecionar tipo" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(CLASSROOM_TYPE_LABELS).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="capacity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Capacidade</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={1}
                    {...field}
                    onChange={(e) => field.onChange(parseInt(e.target.value, 10) || 1)}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="branchId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Filial</FormLabel>
              <Select
                onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)}
                defaultValue={field.value ?? "__none__"}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecionar filial (opcional)" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="__none__">Sem filial</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Descrição</FormLabel>
              <FormControl>
                <Textarea placeholder="Descrição opcional..." {...field} value={field.value ?? ""} rows={3} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {!isOnline && (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Localização</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Bloco A" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="floor"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Piso</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: 1.º andar" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        {isOnline && (
          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="meetingProvider"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Plataforma</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(v === "__none__" ? undefined : v)}
                    defaultValue={field.value ?? "__none__"}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar plataforma" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="__none__">Nenhuma</SelectItem>
                      {Object.entries(MEETING_PROVIDER_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="meetingUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>URL da Reunião</FormLabel>
                  <FormControl>
                    <Input placeholder="https://..." {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        )}

        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Estado</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Selecionar estado" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.entries(CLASSROOM_STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? "A guardar..." : classroom ? "Guardar Alterações" : "Criar Sala"}
          </Button>
          <Button type="button" variant="outline" onClick={() => router.back()} disabled={isPending}>
            Cancelar
          </Button>
        </div>
      </form>
    </Form>
  );
}
