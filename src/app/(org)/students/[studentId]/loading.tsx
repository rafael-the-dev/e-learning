import { Skeleton } from "@/shared/components/ui/skeleton";

export default function StudentDetailLoading() {
  return (
    <div className="p-4 sm:p-8 space-y-6">
      <Skeleton className="h-24 rounded-xl" />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Skeleton className="h-32 rounded-xl" />
        </div>
        <Skeleton className="h-32 rounded-xl" />
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>

      <Skeleton className="h-10 w-full max-w-xl rounded-lg" />

      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
