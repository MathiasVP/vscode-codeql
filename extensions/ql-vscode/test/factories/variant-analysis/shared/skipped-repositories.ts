import { faker } from "@faker-js/faker";
import {
  VariantAnalysisSkippedRepositories,
  VariantAnalysisSkippedRepositoryGroup,
} from "../../../../src/variant-analysis/shared/variant-analysis";
import { createMockRepositoryWithMetadata } from "./repository";

export function createMockSkippedRepos(): VariantAnalysisSkippedRepositories {
  return {
    accessMismatchRepos: createMockSkippedRepoGroup(),
    noCodeqlDbRepos: createMockSkippedRepoGroup(),
    notFoundRepos: createMockNotFoundRepoGroup(),
    overLimitRepos: createMockSkippedRepoGroup(),
  };
}

export function createMockSkippedRepoGroup(): VariantAnalysisSkippedRepositoryGroup {
  return {
    repositoryCount: 2,
    repositories: [
      createMockRepositoryWithMetadata(),
      createMockRepositoryWithMetadata(),
    ],
  };
}

export function createMockNotFoundRepoGroup(): VariantAnalysisSkippedRepositoryGroup {
  return {
    repositoryCount: 2,
    repositories: [
      {
        fullName: `github/${faker.word.sample()}`,
      },
      {
        fullName: `github/${faker.word.sample()}`,
      },
    ],
  };
}
