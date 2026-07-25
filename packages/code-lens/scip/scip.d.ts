import * as $protobuf from "protobufjs";

export namespace scip {

    interface IIndex extends scip.Index.$Properties {
    }

    class Index {
        constructor(properties?: scip.Index.$Properties);
        $unknowns?: Uint8Array[];
        metadata?: (scip.Metadata.$Properties|null);
        documents: scip.Document.$Properties[];
        externalSymbols: scip.SymbolInformation.$Properties[];
        static create(properties: scip.Index.$Shape): scip.Index & scip.Index.$Shape;
        static create(properties?: scip.Index.$Properties): scip.Index;
        static encode(message: scip.Index.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static encodeDelimited(message: scip.Index.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): scip.Index & scip.Index.$Shape;
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): scip.Index & scip.Index.$Shape;
        static verify(message: { [k: string]: any }): (string|null);
        static fromObject(object: { [k: string]: any }): scip.Index;
        static toObject(message: scip.Index, options?: $protobuf.IConversionOptions): { [k: string]: any };
        toJSON(): { [k: string]: any };
        static getTypeUrl(prefix?: string): string;
    }

    namespace Index {
        interface $Properties {
            metadata?: (scip.Metadata.$Properties|null);
            documents?: (scip.Document.$Properties[]|null);
            externalSymbols?: (scip.SymbolInformation.$Properties[]|null);
            $unknowns?: Uint8Array[];
        }
        type $Shape = {
          metadata?: scip.Metadata.$Shape|null;
          documents?: scip.Document.$Shape[]|null;
          externalSymbols?: scip.SymbolInformation.$Shape[]|null;
          $unknowns?: Uint8Array[];
        };
    }

    interface IMetadata extends scip.Metadata.$Properties {
    }

    class Metadata {
        constructor(properties?: scip.Metadata.$Properties);
        $unknowns?: Uint8Array[];
        version: scip.ProtocolVersion;
        toolInfo?: (scip.ToolInfo.$Properties|null);
        projectRoot: string;
        textDocumentEncoding: scip.TextEncoding;
        static create(properties: scip.Metadata.$Shape): scip.Metadata & scip.Metadata.$Shape;
        static create(properties?: scip.Metadata.$Properties): scip.Metadata;
        static encode(message: scip.Metadata.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static encodeDelimited(message: scip.Metadata.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): scip.Metadata & scip.Metadata.$Shape;
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): scip.Metadata & scip.Metadata.$Shape;
        static verify(message: { [k: string]: any }): (string|null);
        static fromObject(object: { [k: string]: any }): scip.Metadata;
        static toObject(message: scip.Metadata, options?: $protobuf.IConversionOptions): { [k: string]: any };
        toJSON(): { [k: string]: any };
        static getTypeUrl(prefix?: string): string;
    }

    namespace Metadata {
        interface $Properties {
            version?: (scip.ProtocolVersion|null);
            toolInfo?: (scip.ToolInfo.$Properties|null);
            projectRoot?: (string|null);
            textDocumentEncoding?: (scip.TextEncoding|null);
            $unknowns?: Uint8Array[];
        }
        type $Shape = scip.Metadata.$Properties;
    }

    enum ProtocolVersion {
        UnspecifiedProtocolVersion = 0
    }

    enum TextEncoding {
        UnspecifiedTextEncoding = 0,
        UTF8 = 1,
        UTF16 = 2
    }

    interface IToolInfo extends scip.ToolInfo.$Properties {
    }

    class ToolInfo {
        constructor(properties?: scip.ToolInfo.$Properties);
        $unknowns?: Uint8Array[];
        name: string;
        version: string;
        arguments: string[];
        static create(properties: scip.ToolInfo.$Shape): scip.ToolInfo & scip.ToolInfo.$Shape;
        static create(properties?: scip.ToolInfo.$Properties): scip.ToolInfo;
        static encode(message: scip.ToolInfo.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static encodeDelimited(message: scip.ToolInfo.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): scip.ToolInfo & scip.ToolInfo.$Shape;
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): scip.ToolInfo & scip.ToolInfo.$Shape;
        static verify(message: { [k: string]: any }): (string|null);
        static fromObject(object: { [k: string]: any }): scip.ToolInfo;
        static toObject(message: scip.ToolInfo, options?: $protobuf.IConversionOptions): { [k: string]: any };
        toJSON(): { [k: string]: any };
        static getTypeUrl(prefix?: string): string;
    }

    namespace ToolInfo {
        interface $Properties {
            name?: (string|null);
            version?: (string|null);
            "arguments"?: (string[]|null);
            $unknowns?: Uint8Array[];
        }
        type $Shape = scip.ToolInfo.$Properties;
    }

    interface IDocument extends scip.Document.$Properties {
    }

    class Document {
        constructor(properties?: scip.Document.$Properties);
        $unknowns?: Uint8Array[];
        language: string;
        relativePath: string;
        occurrences: scip.Occurrence.$Properties[];
        symbols: scip.SymbolInformation.$Properties[];
        text: string;
        positionEncoding: scip.PositionEncoding;
        static create(properties: scip.Document.$Shape): scip.Document & scip.Document.$Shape;
        static create(properties?: scip.Document.$Properties): scip.Document;
        static encode(message: scip.Document.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static encodeDelimited(message: scip.Document.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): scip.Document & scip.Document.$Shape;
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): scip.Document & scip.Document.$Shape;
        static verify(message: { [k: string]: any }): (string|null);
        static fromObject(object: { [k: string]: any }): scip.Document;
        static toObject(message: scip.Document, options?: $protobuf.IConversionOptions): { [k: string]: any };
        toJSON(): { [k: string]: any };
        static getTypeUrl(prefix?: string): string;
    }

    namespace Document {
        interface $Properties {
            language?: (string|null);
            relativePath?: (string|null);
            occurrences?: (scip.Occurrence.$Properties[]|null);
            symbols?: (scip.SymbolInformation.$Properties[]|null);
            text?: (string|null);
            positionEncoding?: (scip.PositionEncoding|null);
            $unknowns?: Uint8Array[];
        }
        type $Shape = {
          language?: string|null;
          relativePath?: string|null;
          occurrences?: scip.Occurrence.$Shape[]|null;
          symbols?: scip.SymbolInformation.$Shape[]|null;
          text?: string|null;
          positionEncoding?: scip.PositionEncoding|null;
          $unknowns?: Uint8Array[];
        };
    }

    enum PositionEncoding {
        UnspecifiedPositionEncoding = 0,
        UTF8CodeUnitOffsetFromLineStart = 1,
        UTF16CodeUnitOffsetFromLineStart = 2,
        UTF32CodeUnitOffsetFromLineStart = 3
    }

    interface ISymbol extends scip.Symbol.$Properties {
    }

    class Symbol {
        constructor(properties?: scip.Symbol.$Properties);
        $unknowns?: Uint8Array[];
        scheme: string;
        package?: (scip.Package.$Properties|null);
        descriptors: scip.Descriptor.$Properties[];
        static create(properties: scip.Symbol.$Shape): scip.Symbol & scip.Symbol.$Shape;
        static create(properties?: scip.Symbol.$Properties): scip.Symbol;
        static encode(message: scip.Symbol.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static encodeDelimited(message: scip.Symbol.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): scip.Symbol & scip.Symbol.$Shape;
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): scip.Symbol & scip.Symbol.$Shape;
        static verify(message: { [k: string]: any }): (string|null);
        static fromObject(object: { [k: string]: any }): scip.Symbol;
        static toObject(message: scip.Symbol, options?: $protobuf.IConversionOptions): { [k: string]: any };
        toJSON(): { [k: string]: any };
        static getTypeUrl(prefix?: string): string;
    }

    namespace Symbol {
        interface $Properties {
            scheme?: (string|null);
            "package"?: (scip.Package.$Properties|null);
            descriptors?: (scip.Descriptor.$Properties[]|null);
            $unknowns?: Uint8Array[];
        }
        type $Shape = scip.Symbol.$Properties;
    }

    interface IPackage extends scip.Package.$Properties {
    }

    class Package {
        constructor(properties?: scip.Package.$Properties);
        $unknowns?: Uint8Array[];
        manager: string;
        name: string;
        version: string;
        static create(properties: scip.Package.$Shape): scip.Package & scip.Package.$Shape;
        static create(properties?: scip.Package.$Properties): scip.Package;
        static encode(message: scip.Package.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static encodeDelimited(message: scip.Package.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): scip.Package & scip.Package.$Shape;
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): scip.Package & scip.Package.$Shape;
        static verify(message: { [k: string]: any }): (string|null);
        static fromObject(object: { [k: string]: any }): scip.Package;
        static toObject(message: scip.Package, options?: $protobuf.IConversionOptions): { [k: string]: any };
        toJSON(): { [k: string]: any };
        static getTypeUrl(prefix?: string): string;
    }

    namespace Package {
        interface $Properties {
            manager?: (string|null);
            name?: (string|null);
            version?: (string|null);
            $unknowns?: Uint8Array[];
        }
        type $Shape = scip.Package.$Properties;
    }

    interface IDescriptor extends scip.Descriptor.$Properties {
    }

    class Descriptor {
        constructor(properties?: scip.Descriptor.$Properties);
        $unknowns?: Uint8Array[];
        name: string;
        disambiguator: string;
        suffix: scip.Descriptor.Suffix;
        static create(properties: scip.Descriptor.$Shape): scip.Descriptor & scip.Descriptor.$Shape;
        static create(properties?: scip.Descriptor.$Properties): scip.Descriptor;
        static encode(message: scip.Descriptor.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static encodeDelimited(message: scip.Descriptor.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): scip.Descriptor & scip.Descriptor.$Shape;
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): scip.Descriptor & scip.Descriptor.$Shape;
        static verify(message: { [k: string]: any }): (string|null);
        static fromObject(object: { [k: string]: any }): scip.Descriptor;
        static toObject(message: scip.Descriptor, options?: $protobuf.IConversionOptions): { [k: string]: any };
        toJSON(): { [k: string]: any };
        static getTypeUrl(prefix?: string): string;
    }

    namespace Descriptor {
        interface $Properties {
            name?: (string|null);
            disambiguator?: (string|null);
            suffix?: (scip.Descriptor.Suffix|null);
            $unknowns?: Uint8Array[];
        }
        type $Shape = scip.Descriptor.$Properties;

        enum Suffix {
            UnspecifiedSuffix = 0,
            Namespace = 1,
            Package = 1,
            Type = 2,
            Term = 3,
            Method = 4,
            TypeParameter = 5,
            Parameter = 6,
            Meta = 7,
            Local = 8,
            Macro = 9
        }
    }

    interface ISignature extends scip.Signature.$Properties {
    }

    class Signature {
        constructor(properties?: scip.Signature.$Properties);
        $unknowns?: Uint8Array[];
        language: string;
        text: string;
        occurrences: scip.Occurrence.$Properties[];
        static create(properties: scip.Signature.$Shape): scip.Signature & scip.Signature.$Shape;
        static create(properties?: scip.Signature.$Properties): scip.Signature;
        static encode(message: scip.Signature.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static encodeDelimited(message: scip.Signature.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): scip.Signature & scip.Signature.$Shape;
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): scip.Signature & scip.Signature.$Shape;
        static verify(message: { [k: string]: any }): (string|null);
        static fromObject(object: { [k: string]: any }): scip.Signature;
        static toObject(message: scip.Signature, options?: $protobuf.IConversionOptions): { [k: string]: any };
        toJSON(): { [k: string]: any };
        static getTypeUrl(prefix?: string): string;
    }

    namespace Signature {
        interface $Properties {
            language?: (string|null);
            text?: (string|null);
            occurrences?: (scip.Occurrence.$Properties[]|null);
            $unknowns?: Uint8Array[];
        }
        type $Shape = {
          language?: string|null;
          text?: string|null;
          occurrences?: scip.Occurrence.$Shape[]|null;
          $unknowns?: Uint8Array[];
        };
    }

    interface ISymbolInformation extends scip.SymbolInformation.$Properties {
    }

    class SymbolInformation {
        constructor(properties?: scip.SymbolInformation.$Properties);
        $unknowns?: Uint8Array[];
        symbol: string;
        documentation: string[];
        relationships: scip.Relationship.$Properties[];
        kind: scip.SymbolInformation.Kind;
        displayName: string;
        signatureDocumentation?: (scip.Signature.$Properties|null);
        enclosingSymbol: string;
        static create(properties: scip.SymbolInformation.$Shape): scip.SymbolInformation & scip.SymbolInformation.$Shape;
        static create(properties?: scip.SymbolInformation.$Properties): scip.SymbolInformation;
        static encode(message: scip.SymbolInformation.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static encodeDelimited(message: scip.SymbolInformation.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): scip.SymbolInformation & scip.SymbolInformation.$Shape;
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): scip.SymbolInformation & scip.SymbolInformation.$Shape;
        static verify(message: { [k: string]: any }): (string|null);
        static fromObject(object: { [k: string]: any }): scip.SymbolInformation;
        static toObject(message: scip.SymbolInformation, options?: $protobuf.IConversionOptions): { [k: string]: any };
        toJSON(): { [k: string]: any };
        static getTypeUrl(prefix?: string): string;
    }

    namespace SymbolInformation {
        interface $Properties {
            symbol?: (string|null);
            documentation?: (string[]|null);
            relationships?: (scip.Relationship.$Properties[]|null);
            kind?: (scip.SymbolInformation.Kind|null);
            displayName?: (string|null);
            signatureDocumentation?: (scip.Signature.$Properties|null);
            enclosingSymbol?: (string|null);
            $unknowns?: Uint8Array[];
        }
        type $Shape = {
          symbol?: string|null;
          documentation?: string[]|null;
          relationships?: scip.Relationship.$Shape[]|null;
          kind?: scip.SymbolInformation.Kind|null;
          displayName?: string|null;
          signatureDocumentation?: scip.Signature.$Shape|null;
          enclosingSymbol?: string|null;
          $unknowns?: Uint8Array[];
        };

        enum Kind {
            UnspecifiedKind = 0,
            AbstractMethod = 66,
            Accessor = 72,
            Array = 1,
            Assertion = 2,
            AssociatedType = 3,
            Attribute = 4,
            Axiom = 5,
            Boolean = 6,
            Class = 7,
            Concept = 86,
            Constant = 8,
            Constructor = 9,
            Contract = 62,
            DataFamily = 10,
            Delegate = 73,
            Enum = 11,
            EnumMember = 12,
            Error = 63,
            Event = 13,
            Extension = 84,
            Fact = 14,
            Field = 15,
            File = 16,
            Function = 17,
            Getter = 18,
            Grammar = 19,
            Instance = 20,
            Interface = 21,
            Key = 22,
            Lang = 23,
            Lemma = 24,
            Library = 64,
            Macro = 25,
            Method = 26,
            MethodAlias = 74,
            MethodReceiver = 27,
            MethodSpecification = 67,
            Message = 28,
            Mixin = 85,
            Modifier = 65,
            Module = 29,
            Namespace = 30,
            Null = 31,
            Number = 32,
            Object = 33,
            Operator = 34,
            Package = 35,
            PackageObject = 36,
            Parameter = 37,
            ParameterLabel = 38,
            Pattern = 39,
            Predicate = 40,
            Property = 41,
            Protocol = 42,
            ProtocolMethod = 68,
            PureVirtualMethod = 69,
            Quasiquoter = 43,
            SelfParameter = 44,
            Setter = 45,
            Signature = 46,
            SingletonClass = 75,
            SingletonMethod = 76,
            StaticDataMember = 77,
            StaticEvent = 78,
            StaticField = 79,
            StaticMethod = 80,
            StaticProperty = 81,
            StaticVariable = 82,
            String = 48,
            Struct = 49,
            Subscript = 47,
            Tactic = 50,
            Theorem = 51,
            ThisParameter = 52,
            Trait = 53,
            TraitMethod = 70,
            Type = 54,
            TypeAlias = 55,
            TypeClass = 56,
            TypeClassMethod = 71,
            TypeFamily = 57,
            TypeParameter = 58,
            Union = 59,
            Value = 60,
            Variable = 61
        }
    }

    interface IRelationship extends scip.Relationship.$Properties {
    }

    class Relationship {
        constructor(properties?: scip.Relationship.$Properties);
        $unknowns?: Uint8Array[];
        symbol: string;
        isReference: boolean;
        isImplementation: boolean;
        isTypeDefinition: boolean;
        isDefinition: boolean;
        static create(properties: scip.Relationship.$Shape): scip.Relationship & scip.Relationship.$Shape;
        static create(properties?: scip.Relationship.$Properties): scip.Relationship;
        static encode(message: scip.Relationship.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static encodeDelimited(message: scip.Relationship.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): scip.Relationship & scip.Relationship.$Shape;
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): scip.Relationship & scip.Relationship.$Shape;
        static verify(message: { [k: string]: any }): (string|null);
        static fromObject(object: { [k: string]: any }): scip.Relationship;
        static toObject(message: scip.Relationship, options?: $protobuf.IConversionOptions): { [k: string]: any };
        toJSON(): { [k: string]: any };
        static getTypeUrl(prefix?: string): string;
    }

    namespace Relationship {
        interface $Properties {
            symbol?: (string|null);
            isReference?: (boolean|null);
            isImplementation?: (boolean|null);
            isTypeDefinition?: (boolean|null);
            isDefinition?: (boolean|null);
            $unknowns?: Uint8Array[];
        }
        type $Shape = scip.Relationship.$Properties;
    }

    enum SymbolRole {
        UnspecifiedSymbolRole = 0,
        Definition = 1,
        Import = 2,
        WriteAccess = 4,
        ReadAccess = 8,
        Generated = 16,
        Test = 32,
        ForwardDefinition = 64
    }

    enum SyntaxKind {
        UnspecifiedSyntaxKind = 0,
        Comment = 1,
        PunctuationDelimiter = 2,
        PunctuationBracket = 3,
        Keyword = 4,
        IdentifierKeyword = 4,
        IdentifierOperator = 5,
        Identifier = 6,
        IdentifierBuiltin = 7,
        IdentifierNull = 8,
        IdentifierConstant = 9,
        IdentifierMutableGlobal = 10,
        IdentifierParameter = 11,
        IdentifierLocal = 12,
        IdentifierShadowed = 13,
        IdentifierNamespace = 14,
        IdentifierModule = 14,
        IdentifierFunction = 15,
        IdentifierFunctionDefinition = 16,
        IdentifierMacro = 17,
        IdentifierMacroDefinition = 18,
        IdentifierType = 19,
        IdentifierBuiltinType = 20,
        IdentifierAttribute = 21,
        RegexEscape = 22,
        RegexRepeated = 23,
        RegexWildcard = 24,
        RegexDelimiter = 25,
        RegexJoin = 26,
        StringLiteral = 27,
        StringLiteralEscape = 28,
        StringLiteralSpecial = 29,
        StringLiteralKey = 30,
        CharacterLiteral = 31,
        NumericLiteral = 32,
        BooleanLiteral = 33,
        Tag = 34,
        TagAttribute = 35,
        TagDelimiter = 36
    }

    interface ISingleLineRange extends scip.SingleLineRange.$Properties {
    }

    class SingleLineRange {
        constructor(properties?: scip.SingleLineRange.$Properties);
        $unknowns?: Uint8Array[];
        line: number;
        startCharacter: number;
        endCharacter: number;
        static create(properties: scip.SingleLineRange.$Shape): scip.SingleLineRange & scip.SingleLineRange.$Shape;
        static create(properties?: scip.SingleLineRange.$Properties): scip.SingleLineRange;
        static encode(message: scip.SingleLineRange.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static encodeDelimited(message: scip.SingleLineRange.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): scip.SingleLineRange & scip.SingleLineRange.$Shape;
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): scip.SingleLineRange & scip.SingleLineRange.$Shape;
        static verify(message: { [k: string]: any }): (string|null);
        static fromObject(object: { [k: string]: any }): scip.SingleLineRange;
        static toObject(message: scip.SingleLineRange, options?: $protobuf.IConversionOptions): { [k: string]: any };
        toJSON(): { [k: string]: any };
        static getTypeUrl(prefix?: string): string;
    }

    namespace SingleLineRange {
        interface $Properties {
            line?: (number|null);
            startCharacter?: (number|null);
            endCharacter?: (number|null);
            $unknowns?: Uint8Array[];
        }
        type $Shape = scip.SingleLineRange.$Properties;
    }

    interface IMultiLineRange extends scip.MultiLineRange.$Properties {
    }

    class MultiLineRange {
        constructor(properties?: scip.MultiLineRange.$Properties);
        $unknowns?: Uint8Array[];
        startLine: number;
        startCharacter: number;
        endLine: number;
        endCharacter: number;
        static create(properties: scip.MultiLineRange.$Shape): scip.MultiLineRange & scip.MultiLineRange.$Shape;
        static create(properties?: scip.MultiLineRange.$Properties): scip.MultiLineRange;
        static encode(message: scip.MultiLineRange.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static encodeDelimited(message: scip.MultiLineRange.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): scip.MultiLineRange & scip.MultiLineRange.$Shape;
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): scip.MultiLineRange & scip.MultiLineRange.$Shape;
        static verify(message: { [k: string]: any }): (string|null);
        static fromObject(object: { [k: string]: any }): scip.MultiLineRange;
        static toObject(message: scip.MultiLineRange, options?: $protobuf.IConversionOptions): { [k: string]: any };
        toJSON(): { [k: string]: any };
        static getTypeUrl(prefix?: string): string;
    }

    namespace MultiLineRange {
        interface $Properties {
            startLine?: (number|null);
            startCharacter?: (number|null);
            endLine?: (number|null);
            endCharacter?: (number|null);
            $unknowns?: Uint8Array[];
        }
        type $Shape = scip.MultiLineRange.$Properties;
    }

    interface IOccurrence extends scip.Occurrence.$Properties {
    }

    class Occurrence {
        constructor(properties?: scip.Occurrence.$Properties);
        $unknowns?: Uint8Array[];
        range: number[];
        singleLineRange?: (scip.SingleLineRange.$Properties|null);
        multiLineRange?: (scip.MultiLineRange.$Properties|null);
        symbol: string;
        symbolRoles: number;
        overrideDocumentation: string[];
        syntaxKind: scip.SyntaxKind;
        diagnostics: scip.Diagnostic.$Properties[];
        enclosingRange: number[];
        singleLineEnclosingRange?: (scip.SingleLineRange.$Properties|null);
        multiLineEnclosingRange?: (scip.MultiLineRange.$Properties|null);
        typedRange?: ("singleLineRange"|"multiLineRange");
        typedEnclosingRange?: ("singleLineEnclosingRange"|"multiLineEnclosingRange");
        static create(properties: scip.Occurrence.$Shape): scip.Occurrence & scip.Occurrence.$Shape;
        static create(properties?: scip.Occurrence.$Properties): scip.Occurrence;
        static encode(message: scip.Occurrence.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static encodeDelimited(message: scip.Occurrence.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): scip.Occurrence & scip.Occurrence.$Shape;
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): scip.Occurrence & scip.Occurrence.$Shape;
        static verify(message: { [k: string]: any }): (string|null);
        static fromObject(object: { [k: string]: any }): scip.Occurrence;
        static toObject(message: scip.Occurrence, options?: $protobuf.IConversionOptions): { [k: string]: any };
        toJSON(): { [k: string]: any };
        static getTypeUrl(prefix?: string): string;
    }

    namespace Occurrence {
        interface $Properties {
            range?: (number[]|null);
            singleLineRange?: (scip.SingleLineRange.$Properties|null);
            multiLineRange?: (scip.MultiLineRange.$Properties|null);
            symbol?: (string|null);
            symbolRoles?: (number|null);
            overrideDocumentation?: (string[]|null);
            syntaxKind?: (scip.SyntaxKind|null);
            diagnostics?: (scip.Diagnostic.$Properties[]|null);
            enclosingRange?: (number[]|null);
            singleLineEnclosingRange?: (scip.SingleLineRange.$Properties|null);
            multiLineEnclosingRange?: (scip.MultiLineRange.$Properties|null);
            typedRange?: ("singleLineRange"|"multiLineRange");
            typedEnclosingRange?: ("singleLineEnclosingRange"|"multiLineEnclosingRange");
            $unknowns?: Uint8Array[];
        }
        type $Shape = {
          range?: number[]|null;
          singleLineRange?: scip.SingleLineRange.$Shape|null;
          multiLineRange?: scip.MultiLineRange.$Shape|null;
          symbol?: string|null;
          symbolRoles?: number|null;
          overrideDocumentation?: string[]|null;
          syntaxKind?: scip.SyntaxKind|null;
          diagnostics?: scip.Diagnostic.$Shape[]|null;
          enclosingRange?: number[]|null;
          singleLineEnclosingRange?: scip.SingleLineRange.$Shape|null;
          multiLineEnclosingRange?: scip.MultiLineRange.$Shape|null;
          $unknowns?: Uint8Array[];
        } & (
          ({ typedRange?: undefined; singleLineRange?: null; multiLineRange?: null }|{ typedRange?: "singleLineRange"; singleLineRange: scip.SingleLineRange.$Shape; multiLineRange?: null }|{ typedRange?: "multiLineRange"; singleLineRange?: null; multiLineRange: scip.MultiLineRange.$Shape })
        ) & (
          ({ typedEnclosingRange?: undefined; singleLineEnclosingRange?: null; multiLineEnclosingRange?: null }|{ typedEnclosingRange?: "singleLineEnclosingRange"; singleLineEnclosingRange: scip.SingleLineRange.$Shape; multiLineEnclosingRange?: null }|{ typedEnclosingRange?: "multiLineEnclosingRange"; singleLineEnclosingRange?: null; multiLineEnclosingRange: scip.MultiLineRange.$Shape })
        );
    }

    interface IDiagnostic extends scip.Diagnostic.$Properties {
    }

    class Diagnostic {
        constructor(properties?: scip.Diagnostic.$Properties);
        $unknowns?: Uint8Array[];
        severity: scip.Severity;
        code: string;
        message: string;
        source: string;
        tags: scip.DiagnosticTag[];
        static create(properties: scip.Diagnostic.$Shape): scip.Diagnostic & scip.Diagnostic.$Shape;
        static create(properties?: scip.Diagnostic.$Properties): scip.Diagnostic;
        static encode(message: scip.Diagnostic.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static encodeDelimited(message: scip.Diagnostic.$Properties, writer?: $protobuf.Writer): $protobuf.Writer;
        static decode(reader: ($protobuf.Reader|Uint8Array), length?: number): scip.Diagnostic & scip.Diagnostic.$Shape;
        static decodeDelimited(reader: ($protobuf.Reader|Uint8Array)): scip.Diagnostic & scip.Diagnostic.$Shape;
        static verify(message: { [k: string]: any }): (string|null);
        static fromObject(object: { [k: string]: any }): scip.Diagnostic;
        static toObject(message: scip.Diagnostic, options?: $protobuf.IConversionOptions): { [k: string]: any };
        toJSON(): { [k: string]: any };
        static getTypeUrl(prefix?: string): string;
    }

    namespace Diagnostic {
        interface $Properties {
            severity?: (scip.Severity|null);
            code?: (string|null);
            message?: (string|null);
            source?: (string|null);
            tags?: (scip.DiagnosticTag[]|null);
            $unknowns?: Uint8Array[];
        }
        type $Shape = scip.Diagnostic.$Properties;
    }

    enum Severity {
        UnspecifiedSeverity = 0,
        Error = 1,
        Warning = 2,
        Information = 3,
        Hint = 4
    }

    enum DiagnosticTag {
        UnspecifiedDiagnosticTag = 0,
        Unnecessary = 1,
        Deprecated = 2
    }

    enum Language {
        UnspecifiedLanguage = 0,
        ABAP = 60,
        Apex = 96,
        APL = 49,
        Ada = 39,
        Agda = 45,
        AsciiDoc = 86,
        Assembly = 58,
        Awk = 66,
        Bat = 68,
        BibTeX = 81,
        C = 34,
        COBOL = 59,
        CPP = 35,
        CSS = 26,
        CSharp = 1,
        Clojure = 8,
        Coffeescript = 21,
        CommonLisp = 9,
        Coq = 47,
        CUDA = 97,
        Dart = 3,
        Delphi = 57,
        Diff = 88,
        Dockerfile = 80,
        Dyalog = 50,
        Elixir = 17,
        Erlang = 18,
        FSharp = 42,
        Fish = 65,
        Flow = 24,
        Fortran = 56,
        Git_Commit = 91,
        Git_Config = 89,
        Git_Rebase = 92,
        Go = 33,
        GraphQL = 98,
        Groovy = 7,
        HTML = 30,
        Hack = 20,
        Handlebars = 90,
        Haskell = 44,
        Idris = 46,
        Ini = 72,
        J = 51,
        JSON = 75,
        Java = 6,
        JavaScript = 22,
        JavaScriptReact = 93,
        Jsonnet = 76,
        Julia = 55,
        Justfile = 109,
        Kotlin = 4,
        LaTeX = 83,
        Lean = 48,
        Less = 27,
        Lua = 12,
        Luau = 108,
        Makefile = 79,
        Markdown = 84,
        Matlab = 52,
        Nickel = 110,
        Nix = 77,
        OCaml = 41,
        Objective_C = 36,
        Objective_CPP = 37,
        Odin = 111,
        Pascal = 99,
        PHP = 19,
        PLSQL = 70,
        Perl = 13,
        PowerShell = 67,
        Prolog = 71,
        Protobuf = 100,
        Python = 15,
        R = 54,
        Racket = 11,
        Raku = 14,
        Razor = 62,
        Repro = 102,
        ReST = 85,
        Ruby = 16,
        Rust = 40,
        SAS = 61,
        SCSS = 29,
        SML = 43,
        SQL = 69,
        Sass = 28,
        Scala = 5,
        Scheme = 10,
        ShellScript = 64,
        Skylark = 78,
        Slang = 107,
        Solidity = 95,
        Svelte = 106,
        Swift = 2,
        Tcl = 101,
        TOML = 73,
        TeX = 82,
        Thrift = 103,
        TypeScript = 23,
        TypeScriptReact = 94,
        Verilog = 104,
        VHDL = 105,
        VisualBasic = 63,
        Vue = 25,
        Wolfram = 53,
        XML = 31,
        XSL = 32,
        YAML = 74,
        Zig = 38
    }
}
