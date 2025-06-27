# GAQ SQL Converter

This library provides a base SQL conversion utility for building custom SQL connectors for the GAQ (GraphQL Auto Queries) library. It is designed to help you translate GAQ's filter and query objects into SQL statements for any SQL-compatible database.

## Overview

The `sql-converter` package implements the core logic for converting GAQ filter objects, sorting, and pagination options into SQL queries. It is intended to be extended for specific SQL dialects or database drivers, allowing you to adapt GAQ to any SQL database (e.g., MySQL, PostgreSQL, SQLite, etc.).

## Usage

You can use this library as a base class when building your own GAQ database adapter for a SQL database. The base `SqlConverter` class provides generic SQL generation, but you can override any method to customize the SQL syntax for your target database.

### Example: Extending SqlConverter for PostgreSQL

PostgreSQL uses `$1`, `$2`, ... for parameter placeholders, while many other databases use `?`. The GAQ Postgres connector demonstrates how to override the parameterization logic:

```typescript
import { SqlConverter } from '@gaq/sql-converter';

export class PostgresSqlConverter extends SqlConverter {
  override getParametrizedValue(value: any, index: number) {
    return `$${index + 1}`;
  }
}
```

You can now use your custom converter in your GAQ adapter:

```typescript
import { Client } from 'pg';
import { PostgresSqlConverter } from './postgres.sql-converter';

const sqlConverter = new PostgresSqlConverter();
// Use sqlConverter to generate queries for your Postgres client
```

## License

MIT License
