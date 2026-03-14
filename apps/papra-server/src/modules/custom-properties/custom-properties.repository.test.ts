import { describe, expect, test } from 'vitest';
import { createInMemoryDatabase, seedDatabase } from '../app/database/database.test-utils';
import { CUSTOM_PROPERTY_TYPES } from './custom-properties.constants';
import { createCustomPropertiesRepository } from './custom-properties.repository';

describe('custom-properties repository', () => {
  const orgId = 'org_111111111111111111111111';
  const docId = 'doc_111111111111111111111111';

  async function setupDb() {
    const { db } = await createInMemoryDatabase({
      organizations: [{ id: orgId, name: 'Test Org' }],
    });
    await seedDatabase({ db, documents: [{ id: docId, organizationId: orgId, name: 'test.pdf', originalName: 'test.pdf', mimeType: 'application/pdf', originalSha256Hash: 'abc', originalSize: 100, originalStorageKey: 'key' }] });
    return { db, repository: createCustomPropertiesRepository({ db }) };
  }

  describe('property definitions', () => {
    test('can create and retrieve a property definition', async () => {
      const { repository } = await setupDb();

      const { propertyDefinition: created } = await repository.createPropertyDefinition({
        definition: { organizationId: orgId, name: 'Invoice Number', key: 'invoice-number', type: CUSTOM_PROPERTY_TYPES.TEXT },
      });

      expect(created).to.include({ name: 'Invoice Number', type: 'text', organizationId: orgId });

      const { propertyDefinitions } = await repository.getOrganizationPropertyDefinitions({ organizationId: orgId });
      expect(propertyDefinitions).to.have.length(1);
      expect(propertyDefinitions[0]).to.include({ name: 'Invoice Number' });
      expect(propertyDefinitions[0]!.options).to.eql([]);
    });

    test('can get a single property definition by ID', async () => {
      const { repository } = await setupDb();

      const { propertyDefinition: created } = await repository.createPropertyDefinition({
        definition: { organizationId: orgId, name: 'Amount', key: 'amount', type: CUSTOM_PROPERTY_TYPES.NUMBER },
      });

      const { definition } = await repository.getPropertyDefinitionById({ propertyDefinitionId: created!.id, organizationId: orgId });
      expect(definition).to.include({ name: 'Amount', type: 'number' });
    });

    test('returns undefined for non-existent definition', async () => {
      const { repository } = await setupDb();

      const { definition } = await repository.getPropertyDefinitionById({ propertyDefinitionId: 'cpd_nonexistent000000000000', organizationId: orgId });
      expect(definition).to.eql(undefined);
    });

    test('can count property definitions', async () => {
      const { repository } = await setupDb();

      await repository.createPropertyDefinition({ definition: { organizationId: orgId, name: 'A', key: 'a', type: CUSTOM_PROPERTY_TYPES.TEXT } });
      await repository.createPropertyDefinition({ definition: { organizationId: orgId, name: 'B', key: 'b', type: CUSTOM_PROPERTY_TYPES.NUMBER } });

      const { count } = await repository.getOrganizationPropertyDefinitionsCount({ organizationId: orgId });
      expect(count).to.eql(2);
    });

    test('can update a property definition', async () => {
      const { repository } = await setupDb();

      const { propertyDefinition: created } = await repository.createPropertyDefinition({
        definition: { organizationId: orgId, name: 'Old Name', key: 'old-name', type: CUSTOM_PROPERTY_TYPES.TEXT },
      });

      const { propertyDefinition: updated } = await repository.updatePropertyDefinition({
        propertyDefinitionId: created!.id,
        organizationId: orgId,
        name: 'New Name',
      });

      expect(updated).to.include({ name: 'New Name' });
    });

    test('can delete a property definition', async () => {
      const { repository } = await setupDb();

      const { propertyDefinition: created } = await repository.createPropertyDefinition({
        definition: { organizationId: orgId, name: 'To Delete', key: 'to-delete', type: CUSTOM_PROPERTY_TYPES.TEXT },
      });

      await repository.deletePropertyDefinition({ propertyDefinitionId: created!.id, organizationId: orgId });

      const { propertyDefinitions } = await repository.getOrganizationPropertyDefinitions({ organizationId: orgId });
      expect(propertyDefinitions).to.have.length(0);
    });

    test('throws on duplicate name within organization', async () => {
      const { repository } = await setupDb();

      await repository.createPropertyDefinition({ definition: { organizationId: orgId, name: 'Unique', key: 'unique', type: CUSTOM_PROPERTY_TYPES.TEXT } });

      await expect(
        repository.createPropertyDefinition({ definition: { organizationId: orgId, name: 'Unique', key: 'unique', type: CUSTOM_PROPERTY_TYPES.NUMBER } }),
      ).rejects.toThrow('A custom property definition with this name already exists');
    });
  });

  describe('document property values', () => {
    test('setting a value replaces the previous value', async () => {
      const { repository } = await setupDb();

      const { propertyDefinition: definition } = await repository.createPropertyDefinition({
        definition: { organizationId: orgId, name: 'Note', key: 'note', type: CUSTOM_PROPERTY_TYPES.TEXT },
      });

      await repository.setDocumentCustomPropertyValue({
        documentId: docId,
        propertyDefinitionId: definition!.id,
        values: [{ textValue: 'Old' }],
      });

      await repository.setDocumentCustomPropertyValue({
        documentId: docId,
        propertyDefinitionId: definition!.id,
        values: [{ textValue: 'New' }],
      });

      const { values } = await repository.getDocumentCustomPropertyValues({ documentId: docId });
      expect(values).to.have.length(1);
      expect(values[0]!.value.textValue).to.eql('New');
    });

    test('can delete a document property value', async () => {
      const { repository } = await setupDb();

      const { propertyDefinition: definition } = await repository.createPropertyDefinition({
        definition: { organizationId: orgId, name: 'Note', key: 'note', type: CUSTOM_PROPERTY_TYPES.TEXT },
      });

      await repository.setDocumentCustomPropertyValue({
        documentId: docId,
        propertyDefinitionId: definition!.id,
        values: [{ textValue: 'Hello' }],
      });

      await repository.deleteDocumentCustomPropertyValue({
        documentId: docId,
        propertyDefinitionId: definition!.id,
      });

      const { values } = await repository.getDocumentCustomPropertyValues({ documentId: docId });
      expect(values).to.have.length(0);
    });

    test('cascade deletes values when definition is deleted', async () => {
      const { repository } = await setupDb();

      const { propertyDefinition: definition } = await repository.createPropertyDefinition({
        definition: { organizationId: orgId, name: 'Note', key: 'note', type: CUSTOM_PROPERTY_TYPES.TEXT },
      });

      await repository.setDocumentCustomPropertyValue({
        documentId: docId,
        propertyDefinitionId: definition!.id,
        values: [{ textValue: 'Hello' }],
      });

      await repository.deletePropertyDefinition({ propertyDefinitionId: definition!.id, organizationId: orgId });

      const { values } = await repository.getDocumentCustomPropertyValues({ documentId: docId });
      expect(values).to.have.length(0);
    });
  });
});
