import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingDot } from "@/components/ui/loading-dot";
import { toast } from "sonner";
import { showError } from "@/lib/toast-error";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle2,
  Circle,
  Trash2,
  Receipt,
  ListChecks,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/calendar")({
  head: () => ({ meta: [{ title: "Calendar — Mastor" }] }),
  component: CalendarPage,
});

type TaskRow = {
  id: string;
  title: string;
  due_date: string | null;
  status: string;
  project_id: string | null;
};
type ValuationDue = {
  id: string;
  project_id: string;
  valuation_number: number | null;
  status: string;
  valuation_date: string;
};
type ProjectLite = { id: string; name: string };

type AgendaItem =
  | { kind: "task"; id: string; title: string; projectName: string | null; done: boolean }
  | { kind: "valuation"; id: string; title: string; projectName: string | null; status: string };

const dateKey = (d: Date) => format(d, "yyyy-MM-dd");

function CalendarPage() {
  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [valuations, setValuations] = useState<ValuationDue[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [view, setView] = useState<"month" | "week">("month");
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(() => dateKey(new Date()));
  const [newProjectId, setNewProjectId] = useState<string>("none");
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: taskData, error: taskErr }, { data: valData, error: valErr }, { data: projData, error: projErr }] =
      await Promise.all([
        supabase.from("calendar_tasks").select("id,title,due_date,status,project_id").order("due_date"),
        supabase
          .from("valuations")
          .select("id,project_id,valuation_number,status,valuation_date")
          .not("valuation_date", "is", null),
        supabase.from("projects").select("id,name").order("name"),
      ]);
    if (taskErr) showError("Calendar", taskErr);
    if (valErr) showError("Calendar", valErr);
    if (projErr) showError("Calendar", projErr);
    setTasks((taskData ?? []) as TaskRow[]);
    setValuations((valData ?? []) as ValuationDue[]);
    setProjects((projData ?? []) as ProjectLite[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const projectsById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of projects) m.set(p.id, p.name);
    return m;
  }, [projects]);

  const itemsByDate = useMemo(() => {
    const map = new Map<string, AgendaItem[]>();
    for (const t of tasks) {
      if (!t.due_date) continue;
      const arr = map.get(t.due_date) ?? [];
      arr.push({
        kind: "task",
        id: t.id,
        title: t.title,
        projectName: t.project_id ? projectsById.get(t.project_id) ?? null : null,
        done: t.status === "done",
      });
      map.set(t.due_date, arr);
    }
    for (const v of valuations) {
      const arr = map.get(v.valuation_date) ?? [];
      arr.push({
        kind: "valuation",
        id: v.id,
        title: `Valuation ${v.valuation_number ?? "—"}`,
        projectName: projectsById.get(v.project_id) ?? null,
        status: v.status,
      });
      map.set(v.valuation_date, arr);
    }
    return map;
  }, [tasks, valuations, projectsById]);

  const unscheduled = tasks.filter((t) => !t.due_date && t.status !== "done");

  const addTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes.user) {
      setAdding(false);
      toast.error("You must be signed in to add a task.");
      return;
    }
    const { error } = await supabase.from("calendar_tasks").insert({
      user_id: userRes.user.id,
      title,
      due_date: newDate || null,
      project_id: newProjectId === "none" ? null : newProjectId,
      status: "open",
    } as any);
    setAdding(false);
    if (error) return showError("Calendar", error);
    setNewTitle("");
    toast.success("Task added");
    load();
  };

  const toggleTask = async (task: TaskRow) => {
    const nextStatus = task.status === "done" ? "open" : "done";
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
    const { error } = await supabase.from("calendar_tasks").update({ status: nextStatus } as any).eq("id", task.id);
    if (error) {
      showError("Calendar", error);
      load();
    }
  };

  const deleteTask = async (id: string) => {
    setTasks((prev) => prev.filter((t) => t.id !== id));
    const { error } = await supabase.from("calendar_tasks").delete().eq("id", id);
    if (error) {
      showError("Calendar", error);
      load();
    }
  };

  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(currentMonth), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDate, { weekStartsOn: 1 });
    const end = endOfWeek(selectedDate, { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [selectedDate]);

  const selectedItems = itemsByDate.get(dateKey(selectedDate)) ?? [];

  if (loading) {
    return (
      <main className="max-w-5xl mx-auto px-4 py-8">
        <LoadingDot label="Loading calendar" />
      </main>
    );
  }

  return (
    <main className="max-w-5xl mx-auto px-4 py-6 pb-20 space-y-6">
      <section className="flex items-center justify-between">
        <div>
          <p className="label-mono">Planner</p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mt-1">Calendar</h1>
        </div>
        <div className="inline-flex p-1 rounded-full bg-secondary">
          {(["month", "week"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "px-4 py-1.5 rounded-full text-sm font-medium capitalize transition-colors",
                view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v}
            </button>
          ))}
        </div>
      </section>

      {/* Quick add */}
      <form
        onSubmit={addTask}
        className="rounded-2xl border border-border bg-card shadow-sm p-4 flex flex-col sm:flex-row gap-2"
      >
        <Input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add a to-do — e.g. Chase supplier for delivery slot"
          className="flex-1"
        />
        <Input
          type="date"
          value={newDate}
          onChange={(e) => setNewDate(e.target.value)}
          className="sm:w-40"
        />
        <Select value={newProjectId} onValueChange={setNewProjectId}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="No project" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No project</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="submit" disabled={adding || !newTitle.trim()} className="gap-1.5">
          <Plus className="w-4 h-4" /> Add
        </Button>
      </form>

      {view === "month" ? (
        <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth((m) => subMonths(m, 1))} aria-label="Previous month">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-sm font-semibold">{format(currentMonth, "MMMM yyyy")}</span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-3 text-xs"
                onClick={() => {
                  setCurrentMonth(startOfMonth(new Date()));
                  setSelectedDate(new Date());
                }}
              >
                Today
              </Button>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))} aria-label="Next month">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
          <div className="grid grid-cols-7 text-center label-mono py-2 border-b border-border">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {gridDays.map((day) => {
              const items = itemsByDate.get(dateKey(day)) ?? [];
              const inMonth = isSameMonth(day, currentMonth);
              const selected = isSameDay(day, selectedDate);
              const hasTask = items.some((i) => i.kind === "task" && !i.done);
              const hasValuation = items.some((i) => i.kind === "valuation");
              return (
                <button
                  key={dateKey(day)}
                  type="button"
                  onClick={() => setSelectedDate(day)}
                  className={cn(
                    "aspect-square flex flex-col items-center justify-center gap-1 border-b border-r border-border text-sm transition-colors",
                    !inMonth && "text-muted-foreground/40",
                    inMonth && !selected && "text-foreground hover:bg-secondary",
                    selected && "bg-primary text-primary-foreground",
                  )}
                >
                  <span className={cn(isToday(day) && !selected && "rounded-full bg-secondary px-1.5")}>
                    {format(day, "d")}
                  </span>
                  <span className="flex gap-0.5 h-1.5">
                    {hasTask && <span className={cn("w-1.5 h-1.5 rounded-full", selected ? "bg-primary-foreground" : "bg-gold")} />}
                    {hasValuation && <span className={cn("w-1.5 h-1.5 rounded-full", selected ? "bg-primary-foreground" : "bg-amber-500")} />}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden divide-y divide-border">
          {weekDays.map((day) => {
            const items = itemsByDate.get(dateKey(day)) ?? [];
            const selected = isSameDay(day, selectedDate);
            return (
              <button
                key={dateKey(day)}
                type="button"
                onClick={() => setSelectedDate(day)}
                className={cn(
                  "w-full text-left px-4 py-3 flex items-center justify-between gap-3 transition-colors",
                  selected ? "bg-secondary" : "hover:bg-secondary/60",
                )}
              >
                <div>
                  <div className={cn("text-sm font-medium", isToday(day) && "text-gold")}>
                    {format(day, "EEEE d MMMM")}
                  </div>
                  {items.length === 0 ? (
                    <div className="text-xs text-muted-foreground mt-0.5">Nothing scheduled</div>
                  ) : (
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {items.length} item{items.length === 1 ? "" : "s"}
                    </div>
                  )}
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
              </button>
            );
          })}
        </section>
      )}

      {/* Day agenda */}
      <section className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-3">
        <h2 className="text-sm font-semibold">{format(selectedDate, "EEEE d MMMM yyyy")}</h2>
        {selectedItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing scheduled for this day.</p>
        ) : (
          <ul className="space-y-2">
            {selectedItems.map((item) =>
              item.kind === "task" ? (
                <TaskAgendaRow
                  key={item.id}
                  item={item}
                  onToggle={() => {
                    const t = tasks.find((x) => x.id === item.id);
                    if (t) toggleTask(t);
                  }}
                  onDelete={() => deleteTask(item.id)}
                />
              ) : (
                <li key={item.id}>
                  <Link
                    to="/valuations/$id"
                    params={{ id: item.id }}
                    className="flex items-center gap-3 rounded-xl border border-border p-3 hover:bg-secondary transition-colors"
                  >
                    <Receipt className="w-4 h-4 text-amber-600 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{item.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {item.projectName ?? "—"} · {item.status}
                      </div>
                    </div>
                  </Link>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      {/* Unscheduled to-dos */}
      {unscheduled.length > 0 && (
        <section className="rounded-2xl border border-border bg-card shadow-sm p-5 space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-muted-foreground" /> Unscheduled to-dos
          </h2>
          <ul className="space-y-2">
            {unscheduled.map((t) => (
              <TaskAgendaRow
                key={t.id}
                item={{
                  kind: "task",
                  id: t.id,
                  title: t.title,
                  projectName: t.project_id ? projectsById.get(t.project_id) ?? null : null,
                  done: false,
                }}
                onToggle={() => toggleTask(t)}
                onDelete={() => deleteTask(t.id)}
              />
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}

function TaskAgendaRow({
  item,
  onToggle,
  onDelete,
}: {
  item: Extract<AgendaItem, { kind: "task" }>;
  onToggle: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border p-3">
      <button type="button" onClick={onToggle} aria-label={item.done ? "Mark as open" : "Mark as done"} className="shrink-0 text-muted-foreground hover:text-gold transition-colors">
        {item.done ? <CheckCircle2 className="w-5 h-5 text-gold" /> : <Circle className="w-5 h-5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-medium truncate", item.done && "line-through text-muted-foreground")}>
          {item.title}
        </div>
        {item.projectName && <div className="text-xs text-muted-foreground truncate">{item.projectName}</div>}
      </div>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete task"
        className="shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </li>
  );
}
