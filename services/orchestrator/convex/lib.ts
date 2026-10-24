import {
  queryGeneric,
  mutationGeneric,
  internalMutationGeneric,
  type DataModelFromSchemaDefinition,
  type GenericDatabaseReader,
  type MutationBuilder,
  type QueryBuilder,
} from 'convex/server';
import type schema from './schema';

/**
 * Schema-typed function builders — the same thing `convex/_generated/server`
 * provides, defined here so the module typechecks before codegen has run.
 */
export type DataModel = DataModelFromSchemaDefinition<typeof schema>;
export type DatabaseReader = GenericDatabaseReader<DataModel>;

export const query: QueryBuilder<DataModel, 'public'> = queryGeneric;
export const mutation: MutationBuilder<DataModel, 'public'> = mutationGeneric;
export const internalMutation: MutationBuilder<DataModel, 'internal'> = internalMutationGeneric;
