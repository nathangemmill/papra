import type { Database } from '../app/database/database.types';
import type { CustomPropertyType } from './custom-properties.constants';
import { injectArguments, safely } from '@corentinth/chisels';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import pLimit from 'p-limit';
import { isUniqueConstraintError } from '../shared/db/constraints.models';
import { isDefined, omitUndefined } from '../shared/utils';
import { createCustomPropertyDefinitionAlreadyExistsError } from './custom-properties.errors';
import { normalizePropertyName } from './custom-properties.repository.models';
import { customPropertyDefinitionsTable, customPropertySelectOptionsTable, documentCustomPropertyValuesTable } from './custom-properties.table';

export type CustomPropertiesRepository = ReturnType<typeof createCustomPropertiesRepository>;

export function createCustomPropertiesRepository({ db }: { db: Database }) {
  return injectArguments(
    {
      getOrganizationPropertyDefinitions,
      getOrganizationPropertyDefinitionsCount,
      getPropertyDefinitionById,
      createPropertyDefinition,
      updatePropertyDefinition,
      deletePropertyDefinition,

      syncSelectOptions,

      getDocumentCustomPropertyValues,
      getCustomPropertyValuesByDocumentIds,
      setDocumentCustomPropertyValue,
      deleteDocumentCustomPropertyValue,
    },
    { db },
  );
}

async function getOrganizationPropertyDefinitions({ organizationId, db }: { organizationId: string; db: Database }) {
  const definitions = await db
    .select()
    .from(customPropertyDefinitionsTable)
    .where(eq(customPropertyDefinitionsTable.organizationId, organizationId))
    .orderBy(asc(customPropertyDefinitionsTable.displayOrder), asc(customPropertyDefinitionsTable.createdAt));

  const definitionIds = definitions.map(d => d.id);

  const options = definitionIds.length > 0
    ? await db
        .select()
        .from(customPropertySelectOptionsTable)
        .where(inArray(customPropertySelectOptionsTable.propertyDefinitionId, definitionIds))
        .orderBy(asc(customPropertySelectOptionsTable.displayOrder))
    : [];

  const optionsByDefinition = new Map<string, typeof options>();

  for (const option of options) {
    const existing = optionsByDefinition.get(option.propertyDefinitionId) ?? [];
    existing.push(option);
    optionsByDefinition.set(option.propertyDefinitionId, existing);
  }

  return {
    propertyDefinitions: definitions.map(definition => ({
      ...definition,
      options: optionsByDefinition.get(definition.id) ?? [],
    })),
  };
}

async function getOrganizationPropertyDefinitionsCount({ organizationId, db }: { organizationId: string; db: Database }) {
  const [result] = await db
    .select({ count: count() })
    .from(customPropertyDefinitionsTable)
    .where(eq(customPropertyDefinitionsTable.organizationId, organizationId));

  return { count: result?.count ?? 0 };
}

async function getPropertyDefinitionById({ propertyDefinitionId, organizationId, db }: { propertyDefinitionId: string; organizationId: string; db: Database }) {
  const [definition] = await db
    .select()
    .from(customPropertyDefinitionsTable)
    .where(
      and(
        eq(customPropertyDefinitionsTable.id, propertyDefinitionId),
        eq(customPropertyDefinitionsTable.organizationId, organizationId),
      ),
    );

  if (!definition) {
    return { definition: undefined };
  }

  const options = await db
    .select()
    .from(customPropertySelectOptionsTable)
    .where(eq(customPropertySelectOptionsTable.propertyDefinitionId, propertyDefinitionId))
    .orderBy(asc(customPropertySelectOptionsTable.displayOrder));

  return {
    definition: {
      ...definition,
      options,
    },
  };
}

async function createPropertyDefinition({ definition, db }: {
  definition: {
    organizationId: string;
    name: string;
    key: string;
    description?: string | null;
    type: CustomPropertyType;
    displayOrder?: number;
  };
  db: Database;
}) {
  const [result, error] = await safely(
    db
      .insert(customPropertyDefinitionsTable)
      .values({
        organizationId: definition.organizationId,
        name: definition.name,
        normalizedName: normalizePropertyName(definition.name),
        key: definition.key,
        description: definition.description,
        type: definition.type,
        displayOrder: definition.displayOrder,
      })
      .returning(),
  );

  if (isUniqueConstraintError({ error })) {
    throw createCustomPropertyDefinitionAlreadyExistsError();
  }

  if (error) {
    throw error;
  }

  const [created] = result;

  return { propertyDefinition: created };
}

async function updatePropertyDefinition({
  propertyDefinitionId,
  organizationId,
  name,
  key,
  description,
  displayOrder,
  db,
}: {
  propertyDefinitionId: string;
  organizationId: string;
  name?: string;
  key?: string;
  description?: string | null;
  displayOrder?: number;
  db: Database;
}) {
  const [result, error] = await safely(
    db
      .update(customPropertyDefinitionsTable)
      .set(omitUndefined({
        name,
        normalizedName: isDefined(name) ? normalizePropertyName(name) : undefined,
        description,
        displayOrder,
        key,
      }))
      .where(
        and(
          eq(customPropertyDefinitionsTable.id, propertyDefinitionId),
          eq(customPropertyDefinitionsTable.organizationId, organizationId),
        ),
      )
      .returning(),
  );

  if (isUniqueConstraintError({ error })) {
    throw createCustomPropertyDefinitionAlreadyExistsError();
  }

  if (error) {
    throw error;
  }

  const [propertyDefinition] = result;

  return { propertyDefinition };
}

async function deletePropertyDefinition({ propertyDefinitionId, organizationId, db }: { propertyDefinitionId: string; organizationId: string; db: Database }) {
  await db
    .delete(customPropertyDefinitionsTable)
    .where(
      and(
        eq(customPropertyDefinitionsTable.id, propertyDefinitionId),
        eq(customPropertyDefinitionsTable.organizationId, organizationId),
      ),
    );
}

async function syncSelectOptions({ propertyDefinitionId, options, db }: {
  propertyDefinitionId: string;
  options: { id?: string; name: string; key: string }[];
  db: Database;
}) {
  const existingOptions = await db
    .select({ id: customPropertySelectOptionsTable.id })
    .from(customPropertySelectOptionsTable)
    .where(eq(customPropertySelectOptionsTable.propertyDefinitionId, propertyDefinitionId));

  const optionsWithPositions = options.map((option, index) => ({ ...option, displayOrder: index }));

  const optionsToUpdate = optionsWithPositions.filter((option): option is { id: string; name: string; key: string; normalizedName: string; displayOrder: number } => option.id !== undefined);
  const optionsToCreate = optionsWithPositions.filter(option => option.id === undefined);
  const optionsIdsToDelete = existingOptions.filter(existing => !options.some(option => option.id === existing.id)).map(o => o.id);

  const hasUpdates = optionsToUpdate.length > 0;
  const hasCreates = optionsToCreate.length > 0;
  const hasDeletes = optionsIdsToDelete.length > 0;

  if (!hasUpdates && !hasCreates && !hasDeletes) {
    return;
  }

  const updateLimit = pLimit(5);

  await db.transaction(async (trx) => {
    const updatePromise = hasUpdates
      ? Promise.all(optionsToUpdate.map(async option =>
          updateLimit(() =>
            trx
              .update(customPropertySelectOptionsTable)
              .set({
                name: option.name,
                normalizedName: normalizePropertyName(option.name),
                displayOrder: option.displayOrder,
              })
              .where(
                and(
                  eq(customPropertySelectOptionsTable.id, option.id),
                  eq(customPropertySelectOptionsTable.propertyDefinitionId, propertyDefinitionId),
                ),
              ),
          )),
        )
      : Promise.resolve();

    const createPromise = hasCreates
      ? trx
          .insert(customPropertySelectOptionsTable)
          .values(optionsToCreate.map(option => ({
            propertyDefinitionId,
            name: option.name,
            normalizedName: normalizePropertyName(option.name),
            key: option.key,
            displayOrder: option.displayOrder,
          })))
      : Promise.resolve();

    const deletePromise = hasDeletes
      ? trx
          .delete(customPropertySelectOptionsTable)
          .where(
            and(
              inArray(customPropertySelectOptionsTable.id, optionsIdsToDelete),
              eq(customPropertySelectOptionsTable.propertyDefinitionId, propertyDefinitionId),
            ),
          )
      : Promise.resolve();

    await Promise.all([updatePromise, createPromise, deletePromise]);
  });
}

async function getDocumentCustomPropertyValues({ documentId, db }: { documentId: string; db: Database }) {
  const values = await db
    .select({
      value: {
        id: documentCustomPropertyValuesTable.id,
        propertyDefinitionId: documentCustomPropertyValuesTable.propertyDefinitionId,
        textValue: documentCustomPropertyValuesTable.textValue,
        numberValue: documentCustomPropertyValuesTable.numberValue,
        dateValue: documentCustomPropertyValuesTable.dateValue,
        booleanValue: documentCustomPropertyValuesTable.booleanValue,
        selectOptionId: documentCustomPropertyValuesTable.selectOptionId,
      },
      definition: {
        id: customPropertyDefinitionsTable.id,
        name: customPropertyDefinitionsTable.name,
        key: customPropertyDefinitionsTable.key,
        type: customPropertyDefinitionsTable.type,
      },
      option: {
        id: customPropertySelectOptionsTable.id,
        name: customPropertySelectOptionsTable.name,
      },
    })
    .from(documentCustomPropertyValuesTable)
    .innerJoin(customPropertyDefinitionsTable, eq(documentCustomPropertyValuesTable.propertyDefinitionId, customPropertyDefinitionsTable.id))
    .leftJoin(customPropertySelectOptionsTable, eq(documentCustomPropertyValuesTable.selectOptionId, customPropertySelectOptionsTable.id))
    .where(eq(documentCustomPropertyValuesTable.documentId, documentId));

  return { values };
}

async function getCustomPropertyValuesByDocumentIds({ documentIds, db }: { documentIds: string[]; db: Database }) {
  if (documentIds.length === 0) {
    return { valuesByDocumentId: {} as Record<string, { value: { id: string; propertyDefinitionId: string; textValue: string | null; numberValue: number | null; dateValue: Date | null; booleanValue: boolean | null; selectOptionId: string | null }; definition: { id: string; name: string; key: string; type: string }; option: { id: string | null; name: string | null } | null }[]> };
  }

  const rows = await db
    .select({
      documentId: documentCustomPropertyValuesTable.documentId,
      value: {
        id: documentCustomPropertyValuesTable.id,
        propertyDefinitionId: documentCustomPropertyValuesTable.propertyDefinitionId,
        textValue: documentCustomPropertyValuesTable.textValue,
        numberValue: documentCustomPropertyValuesTable.numberValue,
        dateValue: documentCustomPropertyValuesTable.dateValue,
        booleanValue: documentCustomPropertyValuesTable.booleanValue,
        selectOptionId: documentCustomPropertyValuesTable.selectOptionId,
      },
      definition: {
        id: customPropertyDefinitionsTable.id,
        name: customPropertyDefinitionsTable.name,
        key: customPropertyDefinitionsTable.key,
        type: customPropertyDefinitionsTable.type,
      },
      option: {
        id: customPropertySelectOptionsTable.id,
        name: customPropertySelectOptionsTable.name,
      },
    })
    .from(documentCustomPropertyValuesTable)
    .innerJoin(customPropertyDefinitionsTable, eq(documentCustomPropertyValuesTable.propertyDefinitionId, customPropertyDefinitionsTable.id))
    .leftJoin(customPropertySelectOptionsTable, eq(documentCustomPropertyValuesTable.selectOptionId, customPropertySelectOptionsTable.id))
    .where(inArray(documentCustomPropertyValuesTable.documentId, documentIds));

  const valuesByDocumentId: Record<string, { value: typeof rows[0]['value']; definition: typeof rows[0]['definition']; option: typeof rows[0]['option'] }[]> = {};

  for (const { documentId, ...rest } of rows) {
    (valuesByDocumentId[documentId] ??= []).push(rest);
  }

  return { valuesByDocumentId };
}

async function setDocumentCustomPropertyValue({ documentId, propertyDefinitionId, values, db }: {
  documentId: string;
  propertyDefinitionId: string;
  values: {
    textValue?: string | null;
    numberValue?: number | null;
    dateValue?: Date | null;
    booleanValue?: boolean | null;
    selectOptionId?: string | null;
  }[];
  db: Database;
}) {
  await db
    .delete(documentCustomPropertyValuesTable)
    .where(
      and(
        eq(documentCustomPropertyValuesTable.documentId, documentId),
        eq(documentCustomPropertyValuesTable.propertyDefinitionId, propertyDefinitionId),
      ),
    );

  if (values.length > 0) {
    await db
      .insert(documentCustomPropertyValuesTable)
      .values(values.map(v => ({
        documentId,
        propertyDefinitionId,
        ...v,
      })));
  }
}

async function deleteDocumentCustomPropertyValue({ documentId, propertyDefinitionId, db }: { documentId: string; propertyDefinitionId: string; db: Database }) {
  await db
    .delete(documentCustomPropertyValuesTable)
    .where(
      and(
        eq(documentCustomPropertyValuesTable.documentId, documentId),
        eq(documentCustomPropertyValuesTable.propertyDefinitionId, propertyDefinitionId),
      ),
    );
}
