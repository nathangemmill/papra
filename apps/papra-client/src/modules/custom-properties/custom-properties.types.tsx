export type CustomPropertyType = 'text' | 'number' | 'date' | 'boolean' | 'select' | 'multi_select';

export type CustomPropertySelectOption = {
  id: string;
  name: string;
  key: string;
  normalizedName: string;
  displayOrder: number;
};

export type CustomPropertyDefinition = {
  id: string;
  organizationId: string;
  name: string;
  normalizedName: string;
  key: string;
  description?: string | null;
  type: CustomPropertyType;
  displayOrder: number;
  options: CustomPropertySelectOption[];
  createdAt: Date;
  updatedAt: Date;
};
