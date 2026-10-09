"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { saveGoalList } from "@/app/actions";
import { btn, input } from "@/components/ui";

const MAX = 5;

type Item = { key: string; id: string | null; title: string };
type Done = { id: string; title: string };

export function GoalEditor({
  date,
  done,
  open,
}: {
  date: string;
  done: Done[];
  open: { id: string; title: string }[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<Item[]>(() => open.map((g) => ({ key: g.id, ...g })));
  const [draft, setDraft] = useState("");
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const full = done.length + items.length >= MAX;

  function change(next: Item[]) {
    setItems(next);
    setDirty(true);
    setMessage(null);
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const title = draft.trim().slice(0, 120);
    if (!title || full) return;
    change([...items, { key: crypto.randomUUID(), id: null, title }]);
    setDraft("");
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.key === active.id);
    const to = items.findIndex((i) => i.key === over.id);
    change(arrayMove(items, from, to));
  }

  function save() {
    startTransition(async () => {
      const error = await saveGoalList(date, [
        ...done.map((g) => ({ id: g.id, title: g.title })),
        ...items.map((i) => ({ id: i.id, title: i.title })),
      ]);
      if (error) return setMessage(error);
      setDirty(false);
      setMessage("Saved.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={add} className="flex gap-2">
        <label htmlFor="new-goal" className="sr-only">
          New goal
        </label>
        <input
          id="new-goal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={120}
          placeholder={full ? "Five is plenty" : "A goal"}
          disabled={full}
          enterKeyHint="done"
          className={input}
        />
        <button
          type="submit"
          disabled={full || !draft.trim()}
          className="min-h-14 shrink-0 rounded-2xl bg-accent px-5 text-lg font-semibold text-accent-fg disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {done.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label="Finished">
          {done.map((g) => (
            <li key={g.id} className="flex min-h-14 items-center gap-3 rounded-2xl bg-accent-soft px-4">
              <span aria-hidden>✓</span>
              <span className="break-words">{g.title}</span>
              <span className="sr-only">(done)</span>
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && (
        <>
          <p className="text-sm text-muted">Top goal comes first. Drag to reorder.</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={items.map((i) => i.key)} strategy={verticalListSortingStrategy}>
              <ol className="flex flex-col gap-2">
                {items.map((item, index) => (
                  <GoalRow
                    key={item.key}
                    item={item}
                    position={done.length + index + 1}
                    onRename={(title) =>
                      change(items.map((i) => (i.key === item.key ? { ...i, title } : i)))
                    }
                    onRemove={() => change(items.filter((i) => i.key !== item.key))}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        </>
      )}

      <button onClick={save} disabled={pending || !dirty} className={btn.primary}>
        {pending ? "Saving…" : dirty ? "Save" : "Saved"}
      </button>
      {message && (
        <p role="status" className="text-center text-muted">
          {message}
        </p>
      )}
    </div>
  );
}

function GoalRow({
  item,
  position,
  onRename,
  onRemove,
}: {
  item: Item;
  position: number;
  onRename: (title: string) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.key,
  });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex min-h-14 items-center gap-1 rounded-2xl border-2 bg-surface pr-1 ${
        isDragging ? "z-10 border-accent shadow-lg" : "border-line"
      }`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label={`Move goal ${position}: ${item.title}`}
        className="flex min-h-12 min-w-12 cursor-grab touch-none items-center justify-center text-xl text-muted"
      >
        ⠿
      </button>
      <span className="w-6 shrink-0 font-semibold text-muted">{position}</span>
      <label className="min-w-0 flex-1">
        <span className="sr-only">Goal {position}</span>
        <input
          value={item.title}
          onChange={(e) => onRename(e.target.value)}
          maxLength={120}
          className="min-h-12 w-full rounded-lg bg-transparent px-2 text-lg outline-none focus:bg-background"
        />
      </label>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.title}`}
        className="flex min-h-12 min-w-12 items-center justify-center rounded-xl text-xl text-muted hover:bg-background"
      >
        ×
      </button>
    </li>
  );
}
