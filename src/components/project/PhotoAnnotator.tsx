import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowUpRight, Circle as CircleIcon, Type, Undo2, Save, X } from "lucide-react";
import type { AnnotationShape } from "@/lib/site-walk-photos";

type Tool = "arrow" | "circle" | "text";

type Props = {
  open: boolean;
  imageBlob: Blob | null;
  onCancel: () => void;
  onSave: (shapes: AnnotationShape[], displayW: number, displayH: number) => void;
  saving?: boolean;
};

export function PhotoAnnotator({ open, imageBlob, onCancel, onSave, saving }: Props) {
  const [tool, setTool] = useState<Tool>("arrow");
  const [color, setColor] = useState<string>("#ef4444");
  const [shapes, setShapes] = useState<AnnotationShape[]>([]);
  const [drawing, setDrawing] = useState<AnnotationShape | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [textOpen, setTextOpen] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!imageBlob) return;
    const url = URL.createObjectURL(imageBlob);
    setImgUrl(url);
    setShapes([]);
    setDrawing(null);
    return () => URL.revokeObjectURL(url);
  }, [imageBlob]);

  const pointer = (e: React.PointerEvent) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onDown = (e: React.PointerEvent) => {
    if (!imgUrl) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = pointer(e);
    if (tool === "text") {
      setTextOpen(p);
      setTextValue("");
      return;
    }
    if (tool === "arrow") {
      setDrawing({ kind: "arrow", x1: p.x, y1: p.y, x2: p.x, y2: p.y, color });
    } else {
      setDrawing({ kind: "circle", cx: p.x, cy: p.y, r: 1, color });
    }
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drawing) return;
    const p = pointer(e);
    if (drawing.kind === "arrow") setDrawing({ ...drawing, x2: p.x, y2: p.y });
    else if (drawing.kind === "circle") {
      const r = Math.hypot(p.x - drawing.cx, p.y - drawing.cy);
      setDrawing({ ...drawing, r });
    }
  };
  const onUp = () => {
    if (!drawing) return;
    if (drawing.kind === "arrow" && Math.hypot(drawing.x2 - drawing.x1, drawing.y2 - drawing.y1) < 6) {
      setDrawing(null);
      return;
    }
    if (drawing.kind === "circle" && drawing.r < 6) {
      setDrawing(null);
      return;
    }
    setShapes((s) => [...s, drawing]);
    setDrawing(null);
  };

  const commitText = () => {
    if (!textOpen || !textValue.trim()) {
      setTextOpen(null);
      return;
    }
    setShapes((s) => [...s, { kind: "text", x: textOpen.x, y: textOpen.y, text: textValue.trim(), color }]);
    setTextOpen(null);
    setTextValue("");
  };

  const renderShape = (s: AnnotationShape, key: string) => {
    if (s.kind === "arrow") {
      const angle = Math.atan2(s.y2 - s.y1, s.x2 - s.x1);
      const head = 16;
      const hx1 = s.x2 - head * Math.cos(angle - Math.PI / 7);
      const hy1 = s.y2 - head * Math.sin(angle - Math.PI / 7);
      const hx2 = s.x2 - head * Math.cos(angle + Math.PI / 7);
      const hy2 = s.y2 - head * Math.sin(angle + Math.PI / 7);
      return (
        <g key={key} stroke={s.color} fill={s.color} strokeWidth={4} strokeLinecap="round">
          <line x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
          <polygon points={`${s.x2},${s.y2} ${hx1},${hy1} ${hx2},${hy2}`} />
        </g>
      );
    }
    if (s.kind === "circle") {
      return <circle key={key} cx={s.cx} cy={s.cy} r={s.r} stroke={s.color} strokeWidth={4} fill="none" />;
    }
    return (
      <g key={key}>
        <rect x={s.x - 4} y={s.y - 22} width={Math.max(40, s.text.length * 11)} height={28} fill="rgba(0,0,0,0.55)" rx={3} />
        <text x={s.x} y={s.y} fill={s.color} fontWeight="bold" fontSize={20}>
          {s.text}
        </text>
      </g>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-3xl p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle>Annotate snapshot</DialogTitle>
        </DialogHeader>

        <div className="px-4 pb-2 flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-border overflow-hidden">
            <button type="button" onClick={() => setTool("arrow")} className={`px-3 py-1.5 text-xs flex items-center gap-1 ${tool === "arrow" ? "bg-primary text-primary-foreground" : "bg-background"}`}>
              <ArrowUpRight className="w-3.5 h-3.5" /> Arrow
            </button>
            <button type="button" onClick={() => setTool("circle")} className={`px-3 py-1.5 text-xs flex items-center gap-1 border-l border-border ${tool === "circle" ? "bg-primary text-primary-foreground" : "bg-background"}`}>
              <CircleIcon className="w-3.5 h-3.5" /> Circle
            </button>
            <button type="button" onClick={() => setTool("text")} className={`px-3 py-1.5 text-xs flex items-center gap-1 border-l border-border ${tool === "text" ? "bg-primary text-primary-foreground" : "bg-background"}`}>
              <Type className="w-3.5 h-3.5" /> Text
            </button>
          </div>
          <div className="flex gap-1">
            {["#ef4444", "#22c55e", "#facc15", "#3b82f6", "#ffffff"].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`h-6 w-6 rounded-full border-2 ${color === c ? "border-foreground" : "border-border"}`}
                style={{ backgroundColor: c }}
                aria-label={`Colour ${c}`}
              />
            ))}
          </div>
          <Button size="sm" variant="ghost" onClick={() => setShapes((s) => s.slice(0, -1))} disabled={shapes.length === 0} className="ml-auto gap-1">
            <Undo2 className="w-3.5 h-3.5" /> Undo
          </Button>
        </div>

        <div
          ref={containerRef}
          className="relative bg-black select-none touch-none"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          {imgUrl && (
            <img
              src={imgUrl}
              alt="Snapshot"
              className="block w-full h-auto max-h-[60vh] object-contain"
              onLoad={(e) => {
                const el = e.currentTarget;
                setDims({ w: el.clientWidth, h: el.clientHeight });
              }}
            />
          )}
          {dims.w > 0 && (
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox={`0 0 ${dims.w} ${dims.h}`}>
              {shapes.map((s, i) => renderShape(s, `s-${i}`))}
              {drawing && renderShape(drawing, "drawing")}
            </svg>
          )}
        </div>

        <DialogFooter className="px-4 py-3 gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={saving} className="gap-1">
            <X className="w-4 h-4" /> Skip
          </Button>
          <Button onClick={() => onSave(shapes, dims.w, dims.h)} disabled={saving} className="gap-1">
            <Save className="w-4 h-4" /> {saving ? "Saving…" : "Save photo"}
          </Button>
        </DialogFooter>

        <Dialog open={!!textOpen} onOpenChange={(o) => { if (!o) setTextOpen(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Add label</DialogTitle>
            </DialogHeader>
            <Input autoFocus value={textValue} onChange={(e) => setTextValue(e.target.value)} placeholder="e.g. Crack in plaster" onKeyDown={(e) => { if (e.key === "Enter") commitText(); }} />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setTextOpen(null)}>Cancel</Button>
              <Button onClick={commitText}>Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
