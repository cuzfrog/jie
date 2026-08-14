import { asClass, type AwilixContainer } from "awilix";
import type { TuiCradle } from "../../container";
import { HelpPanel } from "./help-panel";
import { KanbanPanel } from "./kanban-panel";
import { QuestionPanel } from "./question-panel";
import { TeamPanel } from "./team-panel";
import { TeamTable } from "./team-table";

export function registerPanelsModule(container: AwilixContainer<TuiCradle>): void {
  container.register({
    teamTable: asClass(TeamTable).singleton(),
    teamPanel: asClass(TeamPanel).singleton(),
    kanbanPanel: asClass(KanbanPanel).singleton(),
    helpPanel: asClass(HelpPanel).singleton(),
    questionPanel: asClass(QuestionPanel).singleton(),
  });
}
