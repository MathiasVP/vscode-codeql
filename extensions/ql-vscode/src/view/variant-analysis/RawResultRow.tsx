import * as React from "react";
import { styled } from "styled-components";

import { CellValue } from "../../common/bqrs-cli-types";
import { RawResultCell } from "./RawResultCell";

const StyledRow = styled.div`
  border-color: var(--vscode-editor-snippetFinalTabstopHighlightBorder);
  border-style: solid;
  justify-content: center;
  align-items: center;
  padding: 0.4rem;
  word-break: break-word;
`;

type RowProps = {
  row: CellValue[];
  fileLinkPrefix: string;
  sourceLocationPrefix: string;
};

export const RawResultRow = ({
  row,
  fileLinkPrefix,
  sourceLocationPrefix,
}: RowProps) => (
  <>
    {row.map((cell, cellIndex) => (
      <StyledRow key={cellIndex}>
        <RawResultCell
          value={cell}
          fileLinkPrefix={fileLinkPrefix}
          sourceLocationPrefix={sourceLocationPrefix}
        />
      </StyledRow>
    ))}
  </>
);
