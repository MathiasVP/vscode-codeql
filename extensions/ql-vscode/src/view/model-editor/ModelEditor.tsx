import * as React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ToModelEditorMessage } from "../../common/interface-types";
import {
  VSCodeButton,
  VSCodeCheckbox,
  VSCodeTag,
} from "@vscode/webview-ui-toolkit/react";
import { styled } from "styled-components";
import { ExternalApiUsage } from "../../model-editor/external-api-usage";
import { ModeledMethod } from "../../model-editor/modeled-method";
import { assertNever } from "../../common/helpers-pure";
import { vscode } from "../vscode-api";
import { calculateModeledPercentage } from "../../model-editor/shared/modeled-percentage";
import { LinkIconButton } from "../variant-analysis/LinkIconButton";
import { ModelEditorViewState } from "../../model-editor/shared/view-state";
import { ModeledMethodsList } from "./ModeledMethodsList";
import { percentFormatter } from "./formatters";
import { Mode } from "../../model-editor/shared/mode";
import { InProgressMethods } from "../../model-editor/shared/in-progress-methods";
import { getLanguageDisplayName } from "../../common/query-language";
import { INITIAL_HIDE_MODELED_APIS_VALUE } from "../../model-editor/shared/hide-modeled-apis";

const LoadingContainer = styled.div`
  text-align: center;
  padding: 1em;
  font-size: x-large;
  font-weight: 600;
`;

const ModelEditorContainer = styled.div`
  margin-top: 1rem;
`;

const HeaderContainer = styled.div`
  display: flex;
  flex-direction: row;
  align-items: end;
`;

const HeaderColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5em;
`;

const HeaderSpacer = styled.div`
  flex-grow: 1;
`;

const HeaderRow = styled.div`
  display: flex;
  flex-direction: row;
  gap: 1em;
  align-items: center;
`;

const ViewTitle = styled.h1`
  font-size: 2em;
  font-weight: 500;
  margin: 0;
`;

const EditorContainer = styled.div`
  margin-top: 1rem;
`;

const ButtonsContainer = styled.div`
  display: flex;
  gap: 0.4em;
  margin-bottom: 1rem;
`;

type Props = {
  initialViewState?: ModelEditorViewState;
  initialExternalApiUsages?: ExternalApiUsage[];
  initialModeledMethods?: Record<string, ModeledMethod>;
  initialHideModeledApis?: boolean;
};

export function ModelEditor({
  initialViewState,
  initialExternalApiUsages = [],
  initialModeledMethods = {},
  initialHideModeledApis = INITIAL_HIDE_MODELED_APIS_VALUE,
}: Props): JSX.Element {
  const [viewState, setViewState] = useState<ModelEditorViewState | undefined>(
    initialViewState,
  );

  const [externalApiUsages, setExternalApiUsages] = useState<
    ExternalApiUsage[]
  >(initialExternalApiUsages);
  const [modifiedSignatures, setModifiedSignatures] = useState<Set<string>>(
    new Set(),
  );

  const [inProgressMethods, setInProgressMethods] = useState<InProgressMethods>(
    new InProgressMethods(),
  );

  const [hideModeledApis, setHideModeledApis] = useState(
    initialHideModeledApis,
  );

  useEffect(() => {
    vscode.postMessage({
      t: "hideModeledApis",
      hideModeledApis,
    });
  }, [hideModeledApis]);

  const [modeledMethods, setModeledMethods] = useState<
    Record<string, ModeledMethod>
  >(initialModeledMethods);

  useEffect(() => {
    const listener = (evt: MessageEvent) => {
      if (evt.origin === window.origin) {
        const msg: ToModelEditorMessage = evt.data;
        switch (msg.t) {
          case "setModelEditorViewState":
            setViewState(msg.viewState);
            break;
          case "setExternalApiUsages":
            setExternalApiUsages(msg.externalApiUsages);
            break;
          case "loadModeledMethods":
            setModeledMethods((oldModeledMethods) => {
              return {
                ...msg.modeledMethods,
                ...oldModeledMethods,
              };
            });
            break;
          case "addModeledMethods":
            setModeledMethods((oldModeledMethods) => {
              return {
                ...msg.modeledMethods,
                ...Object.fromEntries(
                  Object.entries(oldModeledMethods).filter(
                    ([, value]) => value.type !== "none",
                  ),
                ),
              };
            });
            setModifiedSignatures(
              (oldModifiedSignatures) =>
                new Set([
                  ...oldModifiedSignatures,
                  ...Object.keys(msg.modeledMethods),
                ]),
            );
            break;
          case "setInProgressMethods":
            setInProgressMethods((oldInProgressMethods) =>
              oldInProgressMethods.setPackageMethods(
                msg.packageName,
                new Set(msg.inProgressMethods),
              ),
            );
            break;
          default:
            assertNever(msg);
        }
      } else {
        // sanitize origin
        const origin = evt.origin.replace(/\n|\r/g, "");
        console.error(`Invalid event origin ${origin}`);
      }
    };
    window.addEventListener("message", listener);

    return () => {
      window.removeEventListener("message", listener);
    };
  }, []);

  const modeledPercentage = useMemo(
    () => calculateModeledPercentage(externalApiUsages),
    [externalApiUsages],
  );

  const onChange = useCallback(
    (modelName: string, method: ExternalApiUsage, model: ModeledMethod) => {
      setModeledMethods((oldModeledMethods) => ({
        ...oldModeledMethods,
        [method.signature]: model,
      }));
      setModifiedSignatures(
        (oldModifiedSignatures) =>
          new Set([...oldModifiedSignatures, method.signature]),
      );
    },
    [],
  );

  const onRefreshClick = useCallback(() => {
    vscode.postMessage({
      t: "refreshExternalApiUsages",
    });
  }, []);

  const onSaveAllClick = useCallback(() => {
    vscode.postMessage({
      t: "saveModeledMethods",
      externalApiUsages,
      modeledMethods,
    });
    setModifiedSignatures(new Set());
  }, [externalApiUsages, modeledMethods]);

  const onSaveModelClick = useCallback(
    (
      externalApiUsages: ExternalApiUsage[],
      modeledMethods: Record<string, ModeledMethod>,
    ) => {
      vscode.postMessage({
        t: "saveModeledMethods",
        externalApiUsages,
        modeledMethods,
      });
      setModifiedSignatures((oldModifiedSignatures) => {
        const newModifiedSignatures = new Set([...oldModifiedSignatures]);
        for (const externalApiUsage of externalApiUsages) {
          newModifiedSignatures.delete(externalApiUsage.signature);
        }
        return newModifiedSignatures;
      });
    },
    [],
  );

  const onGenerateFromSourceClick = useCallback(() => {
    vscode.postMessage({
      t: "generateExternalApi",
    });
  }, []);

  const onModelDependencyClick = useCallback(() => {
    vscode.postMessage({
      t: "modelDependency",
    });
  }, []);

  const onGenerateFromLlmClick = useCallback(
    (
      packageName: string,
      externalApiUsages: ExternalApiUsage[],
      modeledMethods: Record<string, ModeledMethod>,
    ) => {
      vscode.postMessage({
        t: "generateExternalApiFromLlm",
        packageName,
        externalApiUsages,
        modeledMethods,
      });
    },
    [],
  );

  const onStopGenerateFromLlmClick = useCallback((packageName: string) => {
    vscode.postMessage({
      t: "stopGeneratingExternalApiFromLlm",
      packageName,
    });
  }, []);

  const onOpenDatabaseClick = useCallback(() => {
    vscode.postMessage({
      t: "openDatabase",
    });
  }, []);

  const onOpenExtensionPackClick = useCallback(() => {
    vscode.postMessage({
      t: "openExtensionPack",
    });
  }, []);

  const onSwitchModeClick = useCallback(() => {
    const newMode =
      viewState?.mode === Mode.Framework ? Mode.Application : Mode.Framework;

    vscode.postMessage({
      t: "switchMode",
      mode: newMode,
    });
  }, [viewState?.mode]);

  const onHideModeledApis = useCallback(() => {
    setHideModeledApis((oldHideModeledApis) => !oldHideModeledApis);
  }, []);

  if (viewState === undefined || externalApiUsages.length === 0) {
    return <LoadingContainer>Loading...</LoadingContainer>;
  }

  return (
    <ModelEditorContainer>
      <HeaderContainer>
        <HeaderColumn>
          <HeaderRow>
            <ViewTitle>
              {getLanguageDisplayName(viewState.extensionPack.language)}
            </ViewTitle>
            <VSCodeTag>
              {percentFormatter.format(modeledPercentage / 100)} modeled
            </VSCodeTag>
          </HeaderRow>
          <HeaderRow>
            <>{viewState.extensionPack.name}</>
          </HeaderRow>
          <HeaderRow>
            <LinkIconButton onClick={onOpenDatabaseClick}>
              <span slot="start" className="codicon codicon-package"></span>
              Open database
            </LinkIconButton>
            <LinkIconButton onClick={onOpenExtensionPackClick}>
              <span slot="start" className="codicon codicon-package"></span>
              Open extension pack
            </LinkIconButton>
            <LinkIconButton onClick={onSwitchModeClick}>
              <span slot="start" className="codicon codicon-library"></span>
              {viewState.mode === Mode.Framework
                ? "Model as application"
                : "Model as dependency"}
            </LinkIconButton>
          </HeaderRow>
        </HeaderColumn>
        <HeaderSpacer />
        <HeaderColumn>
          <VSCodeCheckbox
            checked={hideModeledApis}
            onChange={onHideModeledApis}
          >
            Hide modeled APIs
          </VSCodeCheckbox>
        </HeaderColumn>
      </HeaderContainer>

      <EditorContainer>
        <ButtonsContainer>
          <VSCodeButton
            onClick={onSaveAllClick}
            disabled={modifiedSignatures.size === 0}
          >
            Save all
          </VSCodeButton>
          <VSCodeButton appearance="secondary" onClick={onRefreshClick}>
            Refresh
          </VSCodeButton>
          {viewState.mode === Mode.Framework && (
            <VSCodeButton onClick={onGenerateFromSourceClick}>
              Generate
            </VSCodeButton>
          )}
        </ButtonsContainer>
        <ModeledMethodsList
          externalApiUsages={externalApiUsages}
          modeledMethods={modeledMethods}
          modifiedSignatures={modifiedSignatures}
          inProgressMethods={inProgressMethods}
          viewState={viewState}
          hideModeledApis={hideModeledApis}
          onChange={onChange}
          onSaveModelClick={onSaveModelClick}
          onGenerateFromLlmClick={onGenerateFromLlmClick}
          onStopGenerateFromLlmClick={onStopGenerateFromLlmClick}
          onGenerateFromSourceClick={onGenerateFromSourceClick}
          onModelDependencyClick={onModelDependencyClick}
        />
      </EditorContainer>
    </ModelEditorContainer>
  );
}
