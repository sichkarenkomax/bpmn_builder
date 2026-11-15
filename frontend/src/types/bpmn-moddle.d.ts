declare module 'bpmn-moddle' {
  export interface ModdleElement {
    $attrs: Record<string, string>;
    get(name: string): unknown;
    set(name: string, value: unknown): void;
  }

  export interface ModdlePlane extends ModdleElement {
    planeElement: ModdleElement[];
  }

  export interface ModdleDiagram extends ModdleElement {
    plane: ModdlePlane;
  }

  export interface ModdleDefinitions extends ModdleElement {
    diagrams: ModdleDiagram[];
  }

  export class BpmnModdle {
    constructor(extensions?: Record<string, unknown>);
    fromXML(xml: string): Promise<{ rootElement: ModdleDefinitions }>;
    toXML(element: ModdleDefinitions, options?: { format?: boolean }): Promise<{ xml: string }>;
  }
}
