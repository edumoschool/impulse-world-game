import { Body, type PipeTransform, Query, Param, HttpStatus } from '@nestjs/common';
import { ApiBody, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { ERROR_CODES } from '@impulse/contracts';
import { z } from 'zod';
import { AppError } from './app-error.js';

/** Validates with a shared contract. Unknown keys are stripped by Zod object schemas. */
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new AppError(ERROR_CODES.VALIDATION_FAILED, 400, 'Request validation failed', {
        issues: result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      });
    }
    return result.data;
  }
}

function toOpenApiSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'input',
    unrepresentable: 'any',
  }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function methodDescriptor(target: object, key: string | symbol | undefined) {
  if (key === undefined) {
    throw new Error('Contract decorators can only be used on controller methods');
  }
  return { key, descriptor: Object.getOwnPropertyDescriptor(target, key) as PropertyDescriptor };
}

/** Validates the body and documents it in OpenAPI from the same schema. */
export function ZodBody(schema: z.ZodType): ParameterDecorator {
  return (target, key, index) => {
    Body(new ZodPipe(schema))(target, key as string, index);
    const method = methodDescriptor(target, key);
    ApiBody({ schema: toOpenApiSchema(schema) })(target, method.key, method.descriptor);
  };
}

export function ZodQuery(schema: z.ZodObject): ParameterDecorator {
  return (target, key, index) => {
    Query(new ZodPipe(schema))(target, key as string, index);
    const method = methodDescriptor(target, key);
    for (const name of Object.keys(schema.shape)) {
      ApiQuery({ name, required: false })(target, method.key, method.descriptor);
    }
  };
}

export function ZodParams(schema: z.ZodObject): ParameterDecorator {
  return (target, key, index) => {
    Param(new ZodPipe(schema))(target, key as string, index);
    const method = methodDescriptor(target, key);
    for (const name of Object.keys(schema.shape)) {
      ApiParam({ name, required: true })(target, method.key, method.descriptor);
    }
  };
}

export function ZodResponse(schema: z.ZodType, status: number = HttpStatus.OK): MethodDecorator {
  return ApiResponse({ status, schema: toOpenApiSchema(schema) });
}
