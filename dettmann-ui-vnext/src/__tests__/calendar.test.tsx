import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { useRef } from "react";
import { enUS } from "date-fns/locale";
import {
  Calendar,
  CalendarProvider,
  useCalendar,
  useCalendarActions,
  useCalendarDay,
  calendarLabelsEn,
  type CalendarHandle,
  type CalendarItem,
  type CalendarRange,
} from "../templates/calendar";
import { computeTimedLayouts } from "../templates/calendar/internal/layout";
import { preloadMonthRange, preloadYearRange } from "../templates/calendar/internal/ranges";

const testCalendarProps = { locale: enUS, labels: calendarLabelsEn };

function makeItem(
  id: string,
  start: Date,
  type = "event",
  overrides: Partial<CalendarItem> = {}
): CalendarItem {
  return { id, type, start, title: id, ...overrides };
}

describe("Calendar.Provider", () => {
  it("exposes provider metadata via useCalendar", () => {
    function Reader() {
      const { metadata } = useCalendar();
      return <span data-testid="tenant">{String(metadata?.tenantId)}</span>;
    }

    render(
      <CalendarProvider metadata={{ tenantId: "123" }}>
        <Reader />
      </CalendarProvider>
    );

    expect(screen.getByTestId("tenant")).toHaveTextContent("123");
  });

  it("navigates with actions.next and updates period title", async () => {
    render(
      <Calendar
        {...testCalendarProps}
        defaultCursorDate={new Date(2026, 0, 15)}
        defaultItems={[]}
      />
    );

    expect(screen.getByText("January 2026")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Next period" }));
    expect(screen.getByText("February 2026")).toBeInTheDocument();
  });

  it("calls onLoad when visible range is not loaded", async () => {
    const onLoad = vi.fn().mockResolvedValue([
      makeItem("a", new Date(2026, 0, 10)),
    ]);

    render(
      <Calendar
        {...testCalendarProps}
        defaultCursorDate={new Date(2026, 0, 15)}
        onLoad={onLoad}
      />
    );

    await waitFor(() => {
      expect(onLoad).toHaveBeenCalled();
    });

    const call = onLoad.mock.calls[0]?.[0];
    expect(call.reason).toBe("visible");
    expect(call.range.start).toBeInstanceOf(Date);
  });

  it("does not call onLoad again when range already loaded", async () => {
    const onLoad = vi.fn().mockResolvedValue([]);

    render(
      <Calendar
        {...testCalendarProps}
        defaultCursorDate={new Date(2026, 0, 15)}
        onLoad={onLoad}
      />
    );

    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: "Previous period" }));
    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole("button", { name: "Next period" }));
    expect(onLoad).toHaveBeenCalledTimes(2);
  });

  it("refresh invalidates and reloads with reason refresh", async () => {
    const onLoad = vi.fn().mockResolvedValue([]);

    function RefreshButton() {
      const { actions } = useCalendar();
      return (
        <button type="button" onClick={() => void actions.refresh()}>
          Refresh
        </button>
      );
    }

    render(
      <CalendarProvider
        {...testCalendarProps}
        defaultCursorDate={new Date(2026, 0, 15)}
        onLoad={onLoad}
      >
        <RefreshButton />
        <Calendar.Root>
          <Calendar.View />
        </Calendar.Root>
      </CalendarProvider>
    );

    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => expect(onLoad).toHaveBeenCalledTimes(2));
    expect(onLoad.mock.calls[1]?.[0].reason).toBe("refresh");
  });

  it("preload accepts arbitrary CalendarRange", async () => {
    const onLoad = vi.fn().mockResolvedValue([]);
    const range: CalendarRange = {
      start: new Date(2026, 2, 1),
      end: new Date(2026, 4, 30),
    };

    function PreloadButton() {
      const { actions } = useCalendar();
      return (
        <button type="button" onClick={() => void actions.preload(range)}>
          Preload
        </button>
      );
    }

    render(
      <CalendarProvider onLoad={onLoad}>
        <PreloadButton />
      </CalendarProvider>
    );

    await userEvent.click(screen.getByRole("button", { name: "Preload" }));

    await waitFor(() => {
      expect(onLoad).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "preload", range })
      );
    });
  });

  it("filters items by type", async () => {
    const items = [
      makeItem("1", new Date(2026, 0, 10), "meeting"),
      makeItem("2", new Date(2026, 0, 10), "payment"),
    ];

    render(
      <Calendar
        {...testCalendarProps}
        defaultCursorDate={new Date(2026, 0, 15)}
        defaultItems={items}
        defaultFilter={{ type: "meeting" }}
      />
    );

    expect(screen.getByRole("button", { name: /^1\b/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^2\b/ })).not.toBeInTheDocument();
  });

  it("execute dispatches generic onAction without domain logic", async () => {
    const onAction = vi.fn();

    function Trigger() {
      const { actions } = useCalendar();
      return (
        <button
          type="button"
          onClick={() =>
            actions.execute("open-item", {
              view: "month",
              metadata: { custom: true },
            })
          }
        >
          Execute
        </button>
      );
    }

    render(
      <CalendarProvider onAction={onAction}>
        <Trigger />
      </CalendarProvider>
    );

    await userEvent.click(screen.getByRole("button", { name: "Execute" }));
    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ name: "open-item", metadata: expect.any(Object) })
    );
  });

  it("external component uses useCalendarActions", async () => {
    function ExternalNav() {
      const actions = useCalendarActions();
      return (
        <button type="button" onClick={actions.next}>
          External Next
        </button>
      );
    }

    render(
      <CalendarProvider {...testCalendarProps} defaultCursorDate={new Date(2026, 0, 15)}>
        <ExternalNav />
        <Calendar.Root>
          <Calendar.Header />
        </Calendar.Root>
      </CalendarProvider>
    );

    expect(screen.getByText("January 2026")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "External Next" }));
    expect(screen.getByText("February 2026")).toBeInTheDocument();
  });

  it("CalendarHandle ref supports goTo and preload", async () => {
    const onLoad = vi.fn().mockResolvedValue([]);

    const septemberRange = {
      start: new Date(2026, 8, 1),
      end: new Date(2026, 8, 30, 23, 59, 59, 999),
    };

    function Harness() {
      const ref = useRef<CalendarHandle>(null);
      return (
        <>
          <button type="button" onClick={() => ref.current?.goTo(new Date(2026, 5, 1))}>
            Go June
          </button>
          <button type="button" onClick={() => void ref.current?.preload(septemberRange)}>
            Ref Preload
          </button>
          <CalendarProvider {...testCalendarProps} ref={ref} defaultCursorDate={new Date(2026, 0, 1)} onLoad={onLoad}>
            <Calendar.Root>
              <Calendar.Header />
            </Calendar.Root>
          </CalendarProvider>
        </>
      );
    }

    render(<Harness />);
    await userEvent.click(screen.getByRole("button", { name: "Go June" }));
    expect(screen.getByText("June 2026")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Ref Preload" }));
    await waitFor(() =>
      expect(onLoad).toHaveBeenCalledWith(
        expect.objectContaining({ reason: "preload", range: septemberRange })
      )
    );
  });

  it("onOverflowClick receives hidden items", async () => {
    const onOverflowClick = vi.fn();
    const day = new Date(2026, 0, 12);
    const items = Array.from({ length: 5 }, (_, i) =>
      makeItem(`item-${i}`, day, "event", { title: `Event ${i}` })
    );

    render(
      <Calendar
        {...testCalendarProps}
        defaultCursorDate={new Date(2026, 0, 15)}
        defaultItems={items}
        onOverflowClick={onOverflowClick}
      />
    );

    const overflowBtn = await screen.findByRole("button", { name: "2 more..." });
    await userEvent.click(overflowBtn);

    expect(onOverflowClick).toHaveBeenCalledWith(
      expect.objectContaining({
        hiddenItems: expect.arrayContaining([
          expect.objectContaining({ id: "item-3" }),
        ]),
        visibleItems: expect.any(Array),
      })
    );
  });

  it("PageHeader renders add event and search when callbacks provided", async () => {
    const onAddEvent = vi.fn();
    const onSearchClick = vi.fn();

    render(
      <Calendar
        {...testCalendarProps}
        defaultCursorDate={new Date(2026, 0, 15)}
        onAddEvent={onAddEvent}
        onSearchClick={onSearchClick}
      />
    );

    expect(screen.getByText("January 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add event" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add event" }));
    await userEvent.click(screen.getByRole("button", { name: "Search" }));

    expect(onAddEvent).toHaveBeenCalledTimes(1);
    expect(onSearchClick).toHaveBeenCalledTimes(1);
  });

  it("custom dayRenderer is used", () => {
    function CustomDay() {
      const { day } = useCalendarDay();
      return <div data-testid="custom-day">{day.date.getDate()}</div>;
    }

    render(
      <Calendar {...testCalendarProps} defaultCursorDate={new Date(2026, 0, 15)} defaultItems={[]}>
        <Calendar.Root>
          <Calendar.Grid dayRenderer={CustomDay} />
        </Calendar.Root>
      </Calendar>
    );

    expect(screen.getAllByTestId("custom-day").length).toBeGreaterThan(0);
  });

  it("onItemClick callback does not receive DOM event", async () => {
    const onItemClick = vi.fn();
    const items = [makeItem("x", new Date(2026, 0, 10), "event", { title: "Click me" })];

    render(
      <Calendar
        {...testCalendarProps}
        defaultCursorDate={new Date(2026, 0, 15)}
        defaultItems={items}
        onItemClick={onItemClick}
      />
    );

    await userEvent.click(screen.getByRole("button", { name: /Click me/ }));
    const arg = onItemClick.mock.calls[0]?.[0];
    expect(arg).toHaveProperty("item");
    expect(arg).not.toHaveProperty("target");
  });
});

describe("Calendar layout engine", () => {
  it("assigns overlapping timed events to multiple columns", () => {
    const day = new Date(2026, 0, 15);
    const a = makeItem("a", new Date(2026, 0, 15, 9, 0), "event", {
      end: new Date(2026, 0, 15, 10, 30),
    });
    const b = makeItem("b", new Date(2026, 0, 15, 9, 30), "event", {
      end: new Date(2026, 0, 15, 11, 0),
    });

    const layouts = computeTimedLayouts([a, b], day);
    expect(layouts.get("a")?.columnCount).toBeGreaterThanOrEqual(2);
    expect(layouts.get("b")?.columnCount).toBeGreaterThanOrEqual(2);
  });
});

describe("Calendar range helpers", () => {
  it("preloadMonthRange and preloadYearRange produce CalendarRange", () => {
    const d = new Date(2026, 3, 15);
    const month = preloadMonthRange(d);
    const year = preloadYearRange(d);
    expect(month.start.getMonth()).toBe(3);
    expect(month.end.getMonth()).toBe(3);
    expect(year.start.getMonth()).toBe(0);
    expect(year.end.getMonth()).toBe(11);
  });
});
