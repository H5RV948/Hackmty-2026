"use client";

/**
 * Tabla de registro: tipo de componente A2UI -> componente React.
 *
 * Debe cubrir exactamente los tipos de banorte-catalog.json. La prueba de
 * `registry.test.ts` falla si hay un tipo en el catalogo sin implementacion.
 */
import type { ComponentType } from "react";
import * as W from "./widgets";
import type { WidgetProps } from "./widgets";

export const ComponentRegistry: Record<string, ComponentType<WidgetProps>> = {
  Text: W.Text,
  Button: W.Button,
  Stat: W.Stat,
  FinancialHealthCard: W.FinancialHealthCard,
  CashflowChart: W.CashflowChart,
  SpendingBreakdown: W.SpendingBreakdown,
  OpportunityGrid: W.OpportunityGrid,
  ExplorationCard: W.ExplorationCard,
  UnderstandingSummary: W.UnderstandingSummary,
  DebtSimulator: W.DebtSimulator,
  OptionComparator: W.OptionComparator,
  ActionPlan: W.ActionPlan,
  CardShowcase: W.CardShowcase,
  CardRanking: W.CardRanking,
  RiskAlert: W.RiskAlert,
  OutOfScopeCard: W.OutOfScopeCard,
  HeadlineVerdict: W.HeadlineVerdict,
  ProductPortfolio: W.ProductPortfolio,
  NextSteps: W.NextSteps,
  BarChart: W.BarChart,
  DonutChart: W.DonutChart,
};

export function isRegistered(type: string): boolean {
  return type in ComponentRegistry;
}
