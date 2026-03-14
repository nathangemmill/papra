import type { Component, JSX } from 'solid-js';
import type { CustomPropertyDefinition, CustomPropertyType } from '../custom-properties.types';
import { getValue, insert, remove, setValue } from '@modular-forms/solid';
import { A } from '@solidjs/router';
import { For, Show } from 'solid-js';
import * as v from 'valibot';
import { createForm } from '@/modules/shared/form/form';
import { Button } from '@/modules/ui/components/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/modules/ui/components/select';
import { TextArea } from '@/modules/ui/components/textarea';
import { TextField, TextFieldLabel, TextFieldRoot } from '@/modules/ui/components/textfield';

const PROPERTY_TYPES: CustomPropertyType[] = ['text', 'number', 'date', 'boolean', 'select', 'multi_select'];
const SELECT_LIKE_TYPES: CustomPropertyType[] = ['select', 'multi_select'];

function generateKeyFromName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    // diacritics normalization é -> e, à -> a, etc.
    .normalize('NFD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

type OptionDraft = { id?: string; name: string; key: string };
export type PropertyDefinitionDraft = { name: string; key: string; description?: string; type: CustomPropertyType; options?: OptionDraft[] };

export const CustomPropertyDefinitionForm: Component<{
  onSubmit: (args: { propertyDefinition: PropertyDefinitionDraft }) => Promise<void> | void;
  organizationId: string;
  propertyDefinition?: CustomPropertyDefinition;
  submitButton: JSX.Element;
}> = (props) => {
  const hasExistingType = () => Boolean(props.propertyDefinition?.type);

  const { form, Form, Field, FieldArray } = createForm({
    onSubmit: async ({ name, key, description, type, options }) => {
      props.onSubmit({
        propertyDefinition: {
          name,
          key,
          description: description || undefined,
          type,
          options,
        },
      });
    },
    schema: v.object({
      name: v.pipe(
        v.string(),
        v.trim(),
        v.minLength(1, 'Name is required'),
        v.maxLength(255, 'Name must be at most 255 characters'),
      ),
      key: v.pipe(
        v.string(),
        v.trim(),
        v.toLowerCase(),
        v.minLength(1, 'Key is required'),
        v.maxLength(64, 'Key must be at most 64 characters'),
        v.regex(/^[a-z]([a-z0-9-_]*[a-z0-9])?$/, 'Key must start with a letter and contain only lowercase letters, numbers, hyphens, and underscores'),
      ),
      description: v.pipe(
        v.string(),
        v.trim(),
        v.maxLength(1000, 'Description must be at most 1000 characters'),
      ),
      type: v.picklist(PROPERTY_TYPES),
      options: v.optional(
        v.array(v.object({
          id: v.optional(v.string()),
          name: v.pipe(
            v.string(),
            v.trim(),
            v.minLength(1, 'Option name is required'),
            v.maxLength(255, 'Option name must be at most 255 characters'),
          ),
          key: v.pipe(
            v.string(),
            v.trim(),
            v.toLowerCase(),
            v.minLength(1, 'Option key is required'),
            v.maxLength(64, 'Option key must be at most 64 characters'),
            v.regex(/^[a-z]([a-z0-9-_]*[a-z0-9])?$/, 'Key must start with a letter and contain only lowercase letters, numbers, hyphens, and underscores'),
          ),
        })),
        [],
      ),
    }),
    initialValues: {
      name: props.propertyDefinition?.name ?? '',
      key: props.propertyDefinition?.key ?? '',
      description: props.propertyDefinition?.description ?? '',
      type: props.propertyDefinition?.type ?? 'text',
      options: props.propertyDefinition?.options?.map(o => ({ id: o.id, name: o.name, key: o.key })) ?? [{ name: '', key: '' }],
    },
  });

  const currentType = () => getValue(form, 'type');
  const isSelectLike = () => SELECT_LIKE_TYPES.includes(currentType() as CustomPropertyType);
  const shouldUpdateKey = () => (getValue(form, 'key') === generateKeyFromName(getValue(form, 'name') ?? ''));

  return (
    <Form>
      <Field name="name">
        {(field, inputProps) => (
          <TextFieldRoot class="flex flex-col gap-1">
            <TextFieldLabel for="name">Name</TextFieldLabel>
            <TextField
              type="text"
              id="name"
              placeholder="e.g. Invoice Amount"
              {...inputProps}
              value={field.value}
              aria-invalid={Boolean(field.error)}
              onInput={(e) => {
                if (shouldUpdateKey()) {
                  setValue(form, 'key', generateKeyFromName(e.currentTarget.value));
                }
                inputProps.onInput?.(e);
              }}
            />
            {field.error && <div class="text-red-500 text-sm">{field.error}</div>}
          </TextFieldRoot>
        )}
      </Field>

      <Field name="key">
        {(field, inputProps) => (
          <TextFieldRoot class="flex flex-col gap-1 mt-4">
            <TextFieldLabel for="key" class="mb-0">
              Key
            </TextFieldLabel>
            <div class="text-muted-foreground">
              A technical unique identifier, used in search filter (like `invoice-amount:&gt;200`), API, and integrations. Only lowercase letters, numbers, hyphens, and underscores.
            </div>

            <TextField
              type="text"
              id="key"
              placeholder="e.g. invoice-amount"
              {...inputProps}
              value={field.value}
              aria-invalid={Boolean(field.error)}
              onInput={(e) => {
                const value = e.currentTarget.value;
                const normalizedValue = generateKeyFromName(value);

                setValue(form, 'key', normalizedValue);
              }}
            />
            {field.error && <div class="text-red-500 text-sm">{field.error}</div>}
          </TextFieldRoot>
        )}
      </Field>

      <Field name="description">
        {(field, inputProps) => (
          <TextFieldRoot class="flex flex-col gap-1 mt-6">
            <TextFieldLabel for="description">
              Description
              <span class="text-muted-foreground font-normal ml-1">(optional)</span>
            </TextFieldLabel>
            <TextArea
              id="description"
              placeholder="Describe what this property is used for"
              {...inputProps}
              value={field.value}
            />
            {field.error && <div class="text-red-500 text-sm">{field.error}</div>}
          </TextFieldRoot>
        )}
      </Field>

      <Field name="type">
        {field => (
          <div class="flex flex-col gap-1 mt-6">
            <label class="text-sm font-medium" for="type">Type</label>
            <Select
              id="type"
              defaultValue={field.value ?? 'text'}
              onChange={value => value && setValue(form, 'type', value as CustomPropertyType)}
              options={PROPERTY_TYPES}
              itemComponent={itemProps => (
                <SelectItem item={itemProps.item}>{itemProps.item.rawValue}</SelectItem>
              )}
              disabled={hasExistingType()}
            >
              <SelectTrigger class="w-full">
                <SelectValue<string>>{state => state.selectedOption()}</SelectValue>
              </SelectTrigger>
              <SelectContent />
            </Select>
            {field.error && <div class="text-red-500 text-sm">{field.error}</div>}
          </div>
        )}
      </Field>

      <Show when={hasExistingType()}>
        <p class="text-xs text-muted-foreground">Property type cannot be changed after creation.</p>
      </Show>

      <Show when={isSelectLike()}>
        <p class="mb-1 font-medium mt-6">Options</p>
        <p class="mb-3 text-sm text-muted-foreground">Define the choices available for this property.</p>

        <FieldArray name="options">
          {fieldArray => (
            <div class="flex flex-col gap-3">
              <For each={fieldArray.items}>
                {(_, index) => (
                  <Field name={`options.${index()}.id`}>
                    {() => (
                      <div class="flex gap-2 items-start">
                        <div class="flex-1 flex gap-2">
                          <Field name={`options.${index()}.name`}>
                            {(field, inputProps) => (
                              <TextFieldRoot class="flex-1">
                                <TextField
                                  placeholder="Option name"
                                  {...inputProps}
                                  value={field.value}
                                  aria-invalid={Boolean(field.error)}
                                  onInput={(e) => {
                                    inputProps.onInput?.(e);
                                    const currentKey = getValue(form, `options.${index()}.key`);
                                    const expectedKey = generateKeyFromName(field.value ?? '');
                                    if (!currentKey || currentKey === expectedKey) {
                                      setValue(form, `options.${index()}.key`, generateKeyFromName(e.currentTarget.value));
                                    }
                                  }}
                                />
                                {field.error && <div class="text-red-500 text-xs mt-1">{field.error}</div>}
                              </TextFieldRoot>
                            )}
                          </Field>
                          <Field name={`options.${index()}.key`}>
                            {(field, inputProps) => (
                              <TextFieldRoot class="flex-1">
                                <TextField
                                  placeholder="option-key"
                                  {...inputProps}
                                  value={field.value}
                                  aria-invalid={Boolean(field.error)}
                                />
                                {field.error && <div class="text-red-500 text-xs mt-1">{field.error}</div>}
                              </TextFieldRoot>
                            )}
                          </Field>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          class="shrink-0"
                          onClick={() => remove(form, 'options', { at: index() })}
                        >
                          <div class="i-tabler-x size-4" />
                        </Button>
                      </div>
                    )}
                  </Field>
                )}
              </For>

              <Button
                variant="outline"
                class="gap-2 mt-1 self-start"
                onClick={() => insert(form, 'options', { value: { name: '', key: '' } })}
              >
                <div class="i-tabler-plus size-4" />
                Add option
              </Button>

              {fieldArray.error && <div class="text-red-500 text-sm">{fieldArray.error}</div>}
            </div>
          )}
        </FieldArray>
      </Show>

      <div class="flex justify-end mt-8 gap-2">
        <Button variant="outline" as={A} href={`/organizations/${props.organizationId}/custom-properties`}>
          Cancel
        </Button>
        {props.submitButton}
      </div>

    </Form>
  );
};
