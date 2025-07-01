import { ArgumentNode, Kind } from 'graphql';

export function parseAstBaseValues(ast: any) {
  switch (ast.kind) {
    case Kind.STRING:
    case Kind.BOOLEAN:
      return ast.value;
    case Kind.INT:
      return parseInt(ast.value, 10);
    case Kind.FLOAT:
      return parseFloat(ast.value);
    case Kind.LIST:
      return ast.values.map((value: any) => parseAstBaseValues(value));
    case Kind.OBJECT:
      // eslint-disable-next-line no-case-declarations
      const value = Object.create(null);
      ast.fields.forEach((field: ArgumentNode) => {
        value[field.name.value] = parseAstBaseValues(field.value);
      });
      return value;
    case Kind.NULL:
      return null;
    case Kind.ENUM:
      return ast.value;
    case Kind.VARIABLE:
      return ast.name.value;

    default:
      throw new Error(`Unsupported AST kind: ${ast.kind}`);
  }
}
