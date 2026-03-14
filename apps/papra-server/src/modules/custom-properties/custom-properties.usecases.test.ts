import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase, seedDatabase } from '../app/database/database.test-utils';
import { loadDryConfig } from '../config/config';
import { CUSTOM_PROPERTY_TYPES } from './custom-properties.constants';
import { createCustomPropertiesRepository } from './custom-properties.repository';
import { createPropertyDefinition, deleteDocumentCustomPropertyValue, deletePropertyDefinition, ensurePropertyDefinitionExists, setDocumentCustomPropertyValue, updatePropertyDefinition } from './custom-properties.usecases';

describe('custom-properties usecases', () => {
  const orgId = 'org_111111111111111111111111';
  const docId = 'doc_111111111111111111111111';
  const { config } = loadDryConfig();

  async function setupDb() {
    const { db } = await createInMemoryDatabase({
      organizations: [{ id: orgId, name: 'Test Org' }],
    });
    await seedDatabase({ db, documents: [{ id: docId, organizationId: orgId, name: 'test.pdf', originalName: 'test.pdf', mimeType: 'application/pdf', originalSha256Hash: 'abc', originalSize: 100, originalStorageKey: 'key' }] });
    return { db, customPropertiesRepository: createCustomPropertiesRepository({ db }) };
  }

  describe('createPropertyDefinition', () => {
    test('creates a property definition successfully', async () => {
      const { customPropertiesRepository } = await setupDb();

      const { propertyDefinition: definition } = await createPropertyDefinition({
        organizationId: orgId,
        name: 'Invoice Number',
        key: 'invoice-number',
        type: CUSTOM_PROPERTY_TYPES.TEXT,
        config,
        customPropertiesRepository,
      });

      expect(definition).to.include({ name: 'Invoice Number', type: 'text' });
    });

    test('enforces organization limit', async () => {
      const { customPropertiesRepository } = await setupDb();

      const limitedConfig = {
        ...config,
        customProperties: { ...config.customProperties, maxCustomPropertiesPerOrganization: 2 },
      };

      await createPropertyDefinition({ organizationId: orgId, name: 'A', key: 'a', type: CUSTOM_PROPERTY_TYPES.TEXT, config: limitedConfig, customPropertiesRepository });
      await createPropertyDefinition({ organizationId: orgId, name: 'B', key: 'b', type: CUSTOM_PROPERTY_TYPES.TEXT, config: limitedConfig, customPropertiesRepository });

      await expect(
        createPropertyDefinition({ organizationId: orgId, name: 'C', key: 'c', type: CUSTOM_PROPERTY_TYPES.TEXT, config: limitedConfig, customPropertiesRepository }),
      ).rejects.toThrow('The maximum number of custom properties for this organization has been reached.');
    });
  });

  describe('updatePropertyDefinition', () => {
    test('updates a property definition', async () => {
      const { customPropertiesRepository } = await setupDb();

      const { propertyDefinition: created } = await createPropertyDefinition({
        organizationId: orgId,
        name: 'Old',
        key: 'old',
        type: CUSTOM_PROPERTY_TYPES.TEXT,
        config,
        customPropertiesRepository,
      });

      const { propertyDefinition: updated } = await updatePropertyDefinition({
        propertyDefinitionId: created!.id,
        organizationId: orgId,
        name: 'New',
        customPropertiesRepository,
      });

      expect(updated).to.include({ name: 'New' });
    });

    test('throws when definition does not exist', async () => {
      const { customPropertiesRepository } = await setupDb();

      await expect(
        updatePropertyDefinition({
          propertyDefinitionId: 'cpd_nonexistent000000000000',
          organizationId: orgId,
          name: 'New',
          customPropertiesRepository,
        }),
      ).rejects.toThrow('Custom property definition not found.');
    });
  });

  describe('deletePropertyDefinition', () => {
    test('deletes a property definition', async () => {
      const { customPropertiesRepository } = await setupDb();

      const { propertyDefinition: created } = await createPropertyDefinition({
        organizationId: orgId,
        name: 'To Delete',
        key: 'to-delete',
        type: CUSTOM_PROPERTY_TYPES.TEXT,
        config,
        customPropertiesRepository,
      });

      await deletePropertyDefinition({
        propertyDefinitionId: created!.id,
        organizationId: orgId,
        customPropertiesRepository,
      });

      await expect(
        ensurePropertyDefinitionExists({
          propertyDefinitionId: created!.id,
          organizationId: orgId,
          customPropertiesRepository,
        }),
      ).rejects.toThrow('Custom property definition not found.');
    });
  });

  describe('setDocumentCustomPropertyValue', () => {
    test('sets a text value on a document', async () => {
      const { customPropertiesRepository } = await setupDb();

      const { propertyDefinition: definition } = await createPropertyDefinition({
        organizationId: orgId,
        name: 'Note',
        key: 'note',
        type: CUSTOM_PROPERTY_TYPES.TEXT,
        config,
        customPropertiesRepository,
      });

      await setDocumentCustomPropertyValue({
        documentId: docId,
        propertyDefinitionId: definition!.id,
        organizationId: orgId,
        value: 'Hello',
        customPropertiesRepository,
      });

      const { values } = await customPropertiesRepository.getDocumentCustomPropertyValues({ documentId: docId });
      expect(values).to.have.length(1);
      expect(values[0]!.value.textValue).to.eql('Hello');
    });

    test('rejects invalid select option ID', async () => {
      const { customPropertiesRepository } = await setupDb();

      const { propertyDefinition: definition } = await createPropertyDefinition({
        organizationId: orgId,
        name: 'Category',
        key: 'category',
        type: CUSTOM_PROPERTY_TYPES.SELECT,
        config,
        customPropertiesRepository,
      });

      await expect(
        setDocumentCustomPropertyValue({
          documentId: docId,
          propertyDefinitionId: definition!.id,
          organizationId: orgId,
          value: 'cpso_nonexistent000000000000',
          customPropertiesRepository,
        }),
      ).rejects.toThrow('The provided value is not a valid option for this select property.');
    });

    test('rejects invalid value type', async () => {
      const { customPropertiesRepository } = await setupDb();

      const { propertyDefinition: definition } = await createPropertyDefinition({
        organizationId: orgId,
        name: 'Amount',
        key: 'amount',
        type: CUSTOM_PROPERTY_TYPES.NUMBER,
        config,
        customPropertiesRepository,
      });

      await expect(
        setDocumentCustomPropertyValue({
          documentId: docId,
          propertyDefinitionId: definition!.id,
          organizationId: orgId,
          value: 'not-a-number',
          customPropertiesRepository,
        }),
      ).rejects.toThrow('The provided value is invalid for this property type.');
    });
  });

  describe('deleteDocumentCustomPropertyValue', () => {
    test('removes a value from a document', async () => {
      const { customPropertiesRepository } = await setupDb();

      const { propertyDefinition: definition } = await createPropertyDefinition({
        organizationId: orgId,
        name: 'Note',
        key: 'note',
        type: CUSTOM_PROPERTY_TYPES.TEXT,
        config,
        customPropertiesRepository,
      });

      await setDocumentCustomPropertyValue({
        documentId: docId,
        propertyDefinitionId: definition!.id,
        organizationId: orgId,
        value: 'Hello',
        customPropertiesRepository,
      });

      await deleteDocumentCustomPropertyValue({
        documentId: docId,
        propertyDefinitionId: definition!.id,
        organizationId: orgId,
        customPropertiesRepository,
      });

      const { values } = await customPropertiesRepository.getDocumentCustomPropertyValues({ documentId: docId });
      expect(values).to.have.length(0);
    });
  });
});
