import type { CalendarView } from "../types";

export type CalendarLabels = {
  today: string;
  previousPeriod: string;
  nextPeriod: string;
  loading: string;
  overflowMore: (count: number) => string;
  viewLabels: Record<CalendarView, string>;
  viewSelectLabels: Record<CalendarView, string>;
  weekNumber: (week: number) => string;
  addEvent: string;
  search: string;
  allDay: string;
  agendaEmptyTitle: string;
  agendaEmptyDescription: string;
  agendaToday: string;
  loadErrorTitle: string;
  calendarAriaLabel: string;
  viewSwitcherAriaLabel: string;
  formatHour: (hour: number) => string;
  formatEventTime: (date: Date) => string;
};

export const calendarLabelsPtBR: CalendarLabels = {
  today: "Hoje",
  previousPeriod: "Período anterior",
  nextPeriod: "Próximo período",
  loading: "Carregando…",
  overflowMore: (count) => `${count} a mais...`,
  viewLabels: {
    month: "Mês",
    week: "Semana",
    day: "Dia",
    year: "Ano",
    agenda: "Agenda",
  },
  viewSelectLabels: {
    month: "Visão do mês",
    week: "Visão da semana",
    day: "Visão do dia",
    year: "Visão do ano",
    agenda: "Visão da agenda",
  },
  weekNumber: (week) => `Semana ${week}`,
  addEvent: "Adicionar evento",
  search: "Buscar",
  allDay: "Dia inteiro",
  agendaEmptyTitle: "Nenhum evento",
  agendaEmptyDescription: "Não há eventos agendados para este período.",
  agendaToday: "Hoje",
  loadErrorTitle: "Falha ao carregar o calendário",
  calendarAriaLabel: "Calendário",
  viewSwitcherAriaLabel: "Visualização do calendário",
  formatHour: (hour) => `${String(hour).padStart(2, "0")}:00`,
  formatEventTime: (date) =>
    date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", hour12: false }),
};

/** Rótulos em inglês — útil em testes ou override explícito. */
export const calendarLabelsEn: CalendarLabels = {
  today: "Today",
  previousPeriod: "Previous period",
  nextPeriod: "Next period",
  loading: "Loading…",
  overflowMore: (count) => `${count} more...`,
  viewLabels: {
    month: "Month",
    week: "Week",
    day: "Day",
    year: "Year",
    agenda: "Agenda",
  },
  viewSelectLabels: {
    month: "Month view",
    week: "Week view",
    day: "Day view",
    year: "Year view",
    agenda: "Agenda view",
  },
  weekNumber: (week) => `Week ${week}`,
  addEvent: "Add event",
  search: "Search",
  allDay: "All day",
  agendaEmptyTitle: "No events",
  agendaEmptyDescription: "There are no events scheduled for this period.",
  agendaToday: "Today",
  loadErrorTitle: "Failed to load calendar",
  calendarAriaLabel: "Calendar",
  viewSwitcherAriaLabel: "Calendar view",
  formatHour: (hour) => {
    if (hour === 0) return "12 AM";
    if (hour < 12) return `${hour} AM`;
    if (hour === 12) return "12 PM";
    return `${hour - 12} PM`;
  },
  formatEventTime: (date) =>
    date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
};
