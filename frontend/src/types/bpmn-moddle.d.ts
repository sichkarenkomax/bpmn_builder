declare module 'bpmn-moddle' {
  export interface ModdleElement {
    $attrs: Record<string, string>;
    get(name: string): unknown;
    set(name: string, value: unknown): void;
    values?: ModdleElement[];
    extensionElements?: { values: ModdleElement[] };
  }

  export interface ModdlePlane extends ModdleElement {
    planeElement: ModdleElement[];
  }

  export interface ModdleDiagram extends ModdleElement {
    plane: ModdlePlane;
  }

  export interface ModdleDefinitions extends ModdleElement {
    diagrams: ModdleDiagram[];
    rootElements: ModdleFlowElement[];
  }

  export interface ModdleFlowElement extends ModdleElement {
    flowElements: ModdleFlowElement[];
  }

  export class BpmnModdle {
    constructor(extensions?: Record<string, unknown>);
    fromXML(xml: string): Promise<{ rootElement: ModdleDefinitions }>;
    toXML(element: ModdleDefinitions, options?: { format?: boolean }): Promise<{ xml: string }>;
  }
}
