import {
  ConfigurationTarget,
  Extension,
  ExtensionContext,
  ConfigurationChangeEvent,
} from "vscode";
import TelemetryReporter from "vscode-extension-telemetry";
import {
  ConfigListener,
  CANARY_FEATURES,
  ENABLE_TELEMETRY,
  GLOBAL_ENABLE_TELEMETRY,
  LOG_TELEMETRY,
  isIntegrationTestMode,
  isCanary,
} from "./config";
import * as appInsights from "applicationinsights";
import { extLogger } from "./common";
import { UserCancellationException } from "./commandRunner";
import { showBinaryChoiceWithUrlDialog } from "./helpers";

// Key is injected at build time through the APP_INSIGHTS_KEY environment variable.
const key = "REPLACE-APP-INSIGHTS-KEY";

export enum CommandCompletion {
  Success = "Success",
  Failed = "Failed",
  Cancelled = "Cancelled",
}

export type ErrorType =
  | "AST_viewer_reveal"
  | "command_failed"
  | "compare_view_show_results"
  | "databases_load_persisted_state"
  | "databases_ui_choose_and_set_database"
  | "databases_ui_remove_orphaned_database"
  | "database_upgrade"
  | "database_upgrade_compilation"
  | "eval_log_viewer_reveal"
  | "gh_actions_api_client_get_repositories_metadata"
  | "legacy_query_server_ml_models_not_found"
  | "legacy_query_server_run_queries"
  | "packaging_download_packs"
  | "preview_query_help"
  | "query_history_deserialization"
  | "query_history_manager_compare_with"
  | "query_history_manager_reveal_file_in_os"
  | "query_history_manager_show_text_document"
  | "query_serialization_unsupported_format"
  | "query_server_run_queries"
  | "remote_queries_submit"
  | "remote_queries_manager_open_results"
  | "remote_queries_manager_monitor_unexpectd_status"
  | "remote_queries_manager_download_missing_index"
  | "resolve_queries"
  | "results_view_on_message"
  | "results_view_interpret_results_info"
  | "results_view_displayed_query_undefined"
  | "test_adapter_remove_databases_before_tests"
  | "variant_analysis_manager_id_not_found";

// Avoid sending the following data to App insights since we don't need it.
const tagsToRemove = [
  "ai.application.ver",
  "ai.device.id",
  "ai.cloud.roleInstance",
  "ai.cloud.role",
  "ai.device.id",
  "ai.device.osArchitecture",
  "ai.device.osPlatform",
  "ai.device.osVersion",
  "ai.internal.sdkVersion",
  "ai.session.id",
];

const baseDataPropertiesToRemove = [
  "common.os",
  "common.platformversion",
  "common.remotename",
  "common.uikind",
  "common.vscodesessionid",
];

export class TelemetryListener extends ConfigListener {
  static relevantSettings = [ENABLE_TELEMETRY, CANARY_FEATURES];

  private reporter?: TelemetryReporter;

  constructor(
    private readonly id: string,
    private readonly version: string,
    private readonly key: string,
    private readonly ctx: ExtensionContext,
  ) {
    super();
  }

  /**
   * This function handles changes to relevant configuration elements. There are 2 configuration
   * ids that this function cares about:
   *
   *     * `codeQL.telemetry.enableTelemetry`: If this one has changed, then we need to re-initialize
   *        the reporter and the reporter may wind up being removed.
   *     * `codeQL.canary`: A change here could possibly re-trigger a dialog popup.
   *
   * Note that the global telemetry setting also gate-keeps whether or not to send telemetry events
   * to Application Insights. However, this gatekeeping happens inside of the vscode-extension-telemetry
   * package. So, this does not need to be handled here.
   *
   * @param e the configuration change event
   */
  async handleDidChangeConfiguration(
    e: ConfigurationChangeEvent,
  ): Promise<void> {
    if (
      e.affectsConfiguration("codeQL.telemetry.enableTelemetry") ||
      e.affectsConfiguration("telemetry.enableTelemetry")
    ) {
      await this.initialize();
    }

    // Re-request telemetry so that users can see the dialog again.
    // Re-request if codeQL.canary is being set to `true` and telemetry
    // is not currently enabled.
    if (
      e.affectsConfiguration("codeQL.canary") &&
      CANARY_FEATURES.getValue() &&
      !ENABLE_TELEMETRY.getValue()
    ) {
      await this.setTelemetryRequested(false);
      await this.requestTelemetryPermission();
    }
  }

  async initialize() {
    await this.requestTelemetryPermission();

    this.disposeReporter();

    if (ENABLE_TELEMETRY.getValue<boolean>()) {
      this.createReporter();
    }
  }

  private createReporter() {
    this.reporter = new TelemetryReporter(
      this.id,
      this.version,
      this.key,
      /* anonymize stack traces */ true,
    );
    this.push(this.reporter);

    const client = (this.reporter as any)
      .appInsightsClient as appInsights.TelemetryClient;
    if (client) {
      // add a telemetry processor to delete unwanted properties
      client.addTelemetryProcessor((envelope: any) => {
        tagsToRemove.forEach((tag) => delete envelope.tags[tag]);
        const baseDataProperties = (envelope.data as any)?.baseData?.properties;
        if (baseDataProperties) {
          baseDataPropertiesToRemove.forEach(
            (prop) => delete baseDataProperties[prop],
          );
        }

        if (LOG_TELEMETRY.getValue<boolean>()) {
          void extLogger.log(`Telemetry: ${JSON.stringify(envelope)}`);
        }
        return true;
      });
    }
  }

  dispose() {
    super.dispose();
    void this.reporter?.dispose();
  }

  sendCommandUsage(name: string, executionTime: number, error?: Error) {
    if (!this.reporter) {
      return;
    }
    const status = !error
      ? CommandCompletion.Success
      : error instanceof UserCancellationException
      ? CommandCompletion.Cancelled
      : CommandCompletion.Failed;

    this.reporter.sendTelemetryEvent(
      "command-usage",
      {
        name,
        status,
        isCanary: isCanary().toString(),
      },
      { executionTime },
    );
  }

  sendUIInteraction(name: string) {
    if (!this.reporter) {
      return;
    }

    this.reporter.sendTelemetryEvent(
      "ui-interaction",
      {
        name,
        isCanary: isCanary().toString(),
      },
      {},
    );
  }

  sendError(
    errorType: ErrorType,
    stack?: string,
    extraProperties?: { [key: string]: string },
  ) {
    if (!this.reporter) {
      return;
    }

    const properties: { [key: string]: string } = {
      type: errorType,
      ...extraProperties,
    };
    if (stack && stack !== "") {
      properties.stack = stack;
    }

    this.reporter.sendTelemetryEvent("error", properties, {});
  }

  /**
   * Displays a popup asking the user if they want to enable telemetry
   * for this extension.
   */
  async requestTelemetryPermission() {
    if (!this.wasTelemetryRequested()) {
      // if global telemetry is disabled, avoid showing the dialog or making any changes
      let result = undefined;
      if (
        GLOBAL_ENABLE_TELEMETRY.getValue() &&
        // Avoid showing the dialog if we are in integration test mode.
        !isIntegrationTestMode()
      ) {
        // Extension won't start until this completes.
        result = await showBinaryChoiceWithUrlDialog(
          "Does the CodeQL Extension by GitHub have your permission to collect usage data and metrics to help us improve CodeQL for VSCode?",
          "https://codeql.github.com/docs/codeql-for-visual-studio-code/about-telemetry-in-codeql-for-visual-studio-code",
        );
      }
      if (result !== undefined) {
        await Promise.all([
          this.setTelemetryRequested(true),
          ENABLE_TELEMETRY.updateValue<boolean>(
            result,
            ConfigurationTarget.Global,
          ),
        ]);
      }
    }
  }

  /**
   * Exposed for testing
   */
  get _reporter() {
    return this.reporter;
  }

  private disposeReporter() {
    if (this.reporter) {
      void this.reporter.dispose();
      this.reporter = undefined;
    }
  }

  private wasTelemetryRequested(): boolean {
    return !!this.ctx.globalState.get<boolean>("telemetry-request-viewed");
  }

  private async setTelemetryRequested(newValue: boolean): Promise<void> {
    await this.ctx.globalState.update("telemetry-request-viewed", newValue);
  }
}

/**
 * The global Telemetry instance
 */
export let telemetryListener: TelemetryListener | undefined;

export async function initializeTelemetry(
  extension: Extension<any>,
  ctx: ExtensionContext,
): Promise<void> {
  if (telemetryListener !== undefined) {
    throw new Error("Telemetry is already initialized");
  }
  telemetryListener = new TelemetryListener(
    extension.id,
    extension.packageJSON.version,
    key,
    ctx,
  );
  // do not await initialization, since doing so will sometimes cause a modal popup.
  // this is a particular problem during integration tests, which will hang if a modal popup is displayed.
  void telemetryListener.initialize();
  ctx.subscriptions.push(telemetryListener);
}
