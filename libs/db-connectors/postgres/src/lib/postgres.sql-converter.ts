import { SqlConverter } from '@gaq/sql-converter';

export class PostgresSqlConverter extends SqlConverter {
  override getParametrizedValue(value: any, index: number) {
    return `$${index + 1}`;
  }
}
