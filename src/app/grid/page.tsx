import { BedGrid } from "@/components/grid/BedGrid";

export default function GridPage() {
  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900">Room Calendar</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Drag and drop guests to reassign beds
        </p>
      </div>
      <BedGrid />
    </div>
  );
}
