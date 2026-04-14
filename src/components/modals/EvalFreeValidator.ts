import { Validator } from '@cfworker/json-schema';
import {
  createErrorHandler,
  getDefaultFormState,
  toErrorList,
  toErrorSchema,
  unwrapErrorHandler,
  validationDataMerge,
} from '@rjsf/utils';
import type {
  CustomValidator,
  ErrorSchema,
  ErrorTransformer,
  FormContextType,
  RJSFSchema,
  RJSFValidationError,
  StrictRJSFSchema,
  UiSchema,
  ValidatorType,
} from '@rjsf/utils';

function toRJSFValidationErrors(errors: any[]): RJSFValidationError[] {
  return errors.map((e) => {
    let property = e.instanceLocation.replace(/^#\/?/, '').replace(/\//g, '.');

    if (property.startsWith('.')) {
      property = property.substring(1);
    }

    let message = e.error;
    let name = e.keyword || 'custom';
    let params: any = {};

    if (message.includes('required')) {
      name = 'required';
      message = 'is a required property';
      const missingProp = e.error.split('"')[1];
      if (missingProp) {
        property = property ? `${property}.${missingProp}` : `.${missingProp}`;
        params = { missingProperty: missingProp };
      }
    }

    if (property && !property.startsWith('.') && !property.startsWith('[')) {
      property = `.${property}`;
    }

    const stack = property ? `${property} ${message}`.trim() : message;

    return {
      name,
      property: property || '.',
      message,
      params,
      stack,
      schemaPath: e.schemaLocation || '',
    };
  });
}

class EvalFreeValidator<
  T = unknown,
  S extends StrictRJSFSchema = RJSFSchema,
  F extends FormContextType = FormContextType,
> implements ValidatorType<T, S, F>
{
  isValid(schema: S, formData: T | undefined, rootSchema: S): boolean {
    try {
      const validator = new Validator(schema as any);
      const dataToValidate =
        formData === undefined
          ? getDefaultFormState(this, schema, formData, rootSchema, true)
          : formData;
      const result = validator.validate(dataToValidate);
      return result.valid;
    } catch {
      return false;
    }
  }

  rawValidation<Result = any>(
    schema: S,
    formData?: T,
  ): { errors?: Result[]; validationError?: Error } {
    try {
      const validator = new Validator(schema as any);
      const result = validator.validate(formData);
      return { errors: result.errors as unknown as Result[] };
    } catch (e) {
      return { validationError: e as Error };
    }
  }

  validateFormData(
    formData: T | undefined,
    schema: S,
    customValidate?: CustomValidator<T, S, F>,
    transformErrors?: ErrorTransformer<T, S, F>,
    uiSchema?: UiSchema<T, S, F>,
  ): { errors: RJSFValidationError[]; errorSchema: ErrorSchema<T> } {
    const dataToValidate =
      formData === undefined ? getDefaultFormState(this, schema, formData, schema, true) : formData;

    const { errors: rawErrors = [], validationError } = this.rawValidation(
      schema,
      dataToValidate as T,
    );

    let errors = toRJSFValidationErrors(rawErrors);

    if (validationError) {
      errors = [...errors, { stack: validationError.message } as RJSFValidationError];
    }

    if (typeof transformErrors === 'function') {
      errors = transformErrors(errors, uiSchema);
    }

    let errorSchema = toErrorSchema(errors) as ErrorSchema<T>;

    if (validationError) {
      errorSchema = {
        ...errorSchema,
        $schema: { __errors: [validationError.message] },
      } as ErrorSchema<T>;
    }

    if (typeof customValidate !== 'function') {
      return { errors, errorSchema };
    }

    const newFormData = getDefaultFormState(this, schema, formData, schema, true) as T;
    const errorHandler = customValidate(newFormData, createErrorHandler<T>(newFormData), uiSchema);
    const userErrorSchema = unwrapErrorHandler(errorHandler);
    return validationDataMerge({ errors, errorSchema }, userErrorSchema);
  }

  toErrorList(errorSchema?: ErrorSchema<T>, fieldPath: string[] = []): RJSFValidationError[] {
    return toErrorList(errorSchema, fieldPath);
  }
}

const evalFreeValidator = new EvalFreeValidator();
export default evalFreeValidator;
