/*eslint-disable block-scoped-var, id-length, no-control-regex, no-magic-numbers, no-mixed-operators, no-prototype-builtins, no-redeclare, no-shadow, no-var, sort-vars, default-case, jsdoc/require-param*/
import $protobuf from "protobufjs/minimal.js";

// Common aliases
const $Reader = $protobuf.Reader, $Writer = $protobuf.Writer, $util = $protobuf.util;
const $Object = $util.global.Object, $undefined = $util.global.undefined, $Error = $util.global.Error, $Array = $util.global.Array, $TypeError = $util.global.TypeError, $String = $util.global.String, $Boolean = $util.global.Boolean, $Number = $util.global.Number;

// Exported root namespace
const $root = $protobuf.roots["default"] || ($protobuf.roots["default"] = {});

export const scip = $root.scip = (() => {

    /**
     * Namespace scip.
     * @exports scip
     * @namespace
     */
    const scip = {};

    scip.Index = (function() {

        /**
         * Properties of an Index.
         * @typedef {Object} scip.Index.$Properties
         * @property {scip.Metadata.$Properties|null} [metadata] Index metadata
         * @property {Array.<scip.Document.$Properties>|null} [documents] Index documents
         * @property {Array.<scip.SymbolInformation.$Properties>|null} [externalSymbols] Index externalSymbols
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of an Index.
         * @memberof scip
         * @interface IIndex
         * @augments scip.Index.$Properties
         * @deprecated Use scip.Index.$Properties instead.
         */

        /**
         * Shape of an Index.
         * @typedef {{
         *   metadata?: scip.Metadata.$Shape|null;
         *   documents?: Array.<scip.Document.$Shape>|null;
         *   externalSymbols?: Array.<scip.SymbolInformation.$Shape>|null;
         *   $unknowns?: Array.<Uint8Array>;
         * }} scip.Index.$Shape
         */

        /**
         * Constructs a new Index.
         * @memberof scip
         * @classdesc Represents an Index.
         * @constructor
         * @param {scip.Index.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const Index = function (properties) {
            this.documents = [];
            this.externalSymbols = [];
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * Index metadata.
         * @member {scip.Metadata.$Properties|null|undefined} metadata
         * @memberof scip.Index
         * @instance
         */
        Index.prototype.metadata = null;

        /**
         * Index documents.
         * @member {Array.<scip.Document.$Properties>} documents
         * @memberof scip.Index
         * @instance
         */
        Index.prototype.documents = $util.emptyArray;

        /**
         * Index externalSymbols.
         * @member {Array.<scip.SymbolInformation.$Properties>} externalSymbols
         * @memberof scip.Index
         * @instance
         */
        Index.prototype.externalSymbols = $util.emptyArray;

        /**
         * Creates a new Index instance using the specified properties.
         * @function create
         * @memberof scip.Index
         * @static
         * @param {scip.Index.$Properties=} [properties] Properties to set
         * @returns {scip.Index} Index instance
         * @type {{
         *   (properties: scip.Index.$Shape): scip.Index & scip.Index.$Shape;
         *   (properties?: scip.Index.$Properties): scip.Index;
         * }}
         */
        Index.create = function(properties) {
            return new Index(properties);
        };

        /**
         * Encodes the specified Index message. Does not implicitly {@link scip.Index.verify|verify} messages.
         * @function encode
         * @memberof scip.Index
         * @static
         * @param {scip.Index.$Properties} message Index message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Index.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.metadata != null && $Object.hasOwnProperty.call(message, "metadata"))
                $root.scip.Metadata.encode(message.metadata, writer.uint32(/* id 1, wireType 2 =*/10).fork(), _depth + 1).ldelim();
            if (message.documents != null && message.documents.length)
                for (let i = 0; i < message.documents.length; ++i)
                    $root.scip.Document.encode(message.documents[i], writer.uint32(/* id 2, wireType 2 =*/18).fork(), _depth + 1).ldelim();
            if (message.externalSymbols != null && message.externalSymbols.length)
                for (let i = 0; i < message.externalSymbols.length; ++i)
                    $root.scip.SymbolInformation.encode(message.externalSymbols[i], writer.uint32(/* id 3, wireType 2 =*/26).fork(), _depth + 1).ldelim();
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified Index message, length delimited. Does not implicitly {@link scip.Index.verify|verify} messages.
         * @function encodeDelimited
         * @memberof scip.Index
         * @static
         * @param {scip.Index.$Properties} message Index message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Index.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes an Index message from the specified reader or buffer.
         * @function decode
         * @memberof scip.Index
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {scip.Index & scip.Index.$Shape} Index
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Index.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.scip.Index(), value;
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        message.metadata = $root.scip.Metadata.decode(reader, reader.uint32(), $undefined, _depth + 1, message.metadata);
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if (!(message.documents && message.documents.length))
                            message.documents = [];
                        message.documents.push($root.scip.Document.decode(reader, reader.uint32(), $undefined, _depth + 1));
                        continue;
                    }
                case 3: {
                        if (wireType !== 2)
                            break;
                        if (!(message.externalSymbols && message.externalSymbols.length))
                            message.externalSymbols = [];
                        message.externalSymbols.push($root.scip.SymbolInformation.decode(reader, reader.uint32(), $undefined, _depth + 1));
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes an Index message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof scip.Index
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {scip.Index & scip.Index.$Shape} Index
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Index.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies an Index message.
         * @function verify
         * @memberof scip.Index
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Index.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.metadata != null && $Object.hasOwnProperty.call(message, "metadata")) {
                let error = $root.scip.Metadata.verify(message.metadata, _depth + 1);
                if (error)
                    return "metadata." + error;
            }
            if (message.documents != null && $Object.hasOwnProperty.call(message, "documents")) {
                if (!$Array.isArray(message.documents))
                    return "documents: array expected";
                for (let i = 0; i < message.documents.length; ++i) {
                    let error = $root.scip.Document.verify(message.documents[i], _depth + 1);
                    if (error)
                        return "documents." + error;
                }
            }
            if (message.externalSymbols != null && $Object.hasOwnProperty.call(message, "externalSymbols")) {
                if (!$Array.isArray(message.externalSymbols))
                    return "externalSymbols: array expected";
                for (let i = 0; i < message.externalSymbols.length; ++i) {
                    let error = $root.scip.SymbolInformation.verify(message.externalSymbols[i], _depth + 1);
                    if (error)
                        return "externalSymbols." + error;
                }
            }
            return null;
        };

        /**
         * Creates an Index message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof scip.Index
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {scip.Index} Index
         */
        Index.fromObject = function (object, _depth) {
            if (object instanceof $root.scip.Index)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".scip.Index: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.scip.Index();
            if (object.metadata != null) {
                if (!$util.isObject(object.metadata))
                    throw $TypeError(".scip.Index.metadata: object expected");
                message.metadata = $root.scip.Metadata.fromObject(object.metadata, _depth + 1);
            }
            if (object.documents) {
                if (!$Array.isArray(object.documents))
                    throw $TypeError(".scip.Index.documents: array expected");
                message.documents = $Array(object.documents.length);
                for (let i = 0; i < object.documents.length; ++i) {
                    if (!$util.isObject(object.documents[i]))
                        throw $TypeError(".scip.Index.documents: object expected");
                    message.documents[i] = $root.scip.Document.fromObject(object.documents[i], _depth + 1);
                }
            }
            if (object.externalSymbols) {
                if (!$Array.isArray(object.externalSymbols))
                    throw $TypeError(".scip.Index.externalSymbols: array expected");
                message.externalSymbols = $Array(object.externalSymbols.length);
                for (let i = 0; i < object.externalSymbols.length; ++i) {
                    if (!$util.isObject(object.externalSymbols[i]))
                        throw $TypeError(".scip.Index.externalSymbols: object expected");
                    message.externalSymbols[i] = $root.scip.SymbolInformation.fromObject(object.externalSymbols[i], _depth + 1);
                }
            }
            return message;
        };

        /**
         * Creates a plain object from an Index message. Also converts values to other types if specified.
         * @function toObject
         * @memberof scip.Index
         * @static
         * @param {scip.Index} message Index
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Index.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.arrays || options.defaults) {
                object.documents = [];
                object.externalSymbols = [];
            }
            if (options.defaults)
                object.metadata = null;
            if (message.metadata != null && $Object.hasOwnProperty.call(message, "metadata"))
                object.metadata = $root.scip.Metadata.toObject(message.metadata, options, _depth + 1);
            if (message.documents && message.documents.length) {
                object.documents = $Array(message.documents.length);
                for (let j = 0; j < message.documents.length; ++j)
                    object.documents[j] = $root.scip.Document.toObject(message.documents[j], options, _depth + 1);
            }
            if (message.externalSymbols && message.externalSymbols.length) {
                object.externalSymbols = $Array(message.externalSymbols.length);
                for (let j = 0; j < message.externalSymbols.length; ++j)
                    object.externalSymbols[j] = $root.scip.SymbolInformation.toObject(message.externalSymbols[j], options, _depth + 1);
            }
            return object;
        };

        /**
         * Converts this Index to JSON.
         * @function toJSON
         * @memberof scip.Index
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Index.prototype.toJSON = function() {
            return Index.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for Index
         * @function getTypeUrl
         * @memberof scip.Index
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        Index.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/scip.Index";
        };

        return Index;
    })();

    scip.Metadata = (function() {

        /**
         * Properties of a Metadata.
         * @typedef {Object} scip.Metadata.$Properties
         * @property {scip.ProtocolVersion|null} [version] Metadata version
         * @property {scip.ToolInfo.$Properties|null} [toolInfo] Metadata toolInfo
         * @property {string|null} [projectRoot] Metadata projectRoot
         * @property {scip.TextEncoding|null} [textDocumentEncoding] Metadata textDocumentEncoding
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a Metadata.
         * @memberof scip
         * @interface IMetadata
         * @augments scip.Metadata.$Properties
         * @deprecated Use scip.Metadata.$Properties instead.
         */

        /**
         * Shape of a Metadata.
         * @typedef {scip.Metadata.$Properties} scip.Metadata.$Shape
         */

        /**
         * Constructs a new Metadata.
         * @memberof scip
         * @classdesc Represents a Metadata.
         * @constructor
         * @param {scip.Metadata.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const Metadata = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * Metadata version.
         * @member {scip.ProtocolVersion} version
         * @memberof scip.Metadata
         * @instance
         */
        Metadata.prototype.version = 0;

        /**
         * Metadata toolInfo.
         * @member {scip.ToolInfo.$Properties|null|undefined} toolInfo
         * @memberof scip.Metadata
         * @instance
         */
        Metadata.prototype.toolInfo = null;

        /**
         * Metadata projectRoot.
         * @member {string} projectRoot
         * @memberof scip.Metadata
         * @instance
         */
        Metadata.prototype.projectRoot = "";

        /**
         * Metadata textDocumentEncoding.
         * @member {scip.TextEncoding} textDocumentEncoding
         * @memberof scip.Metadata
         * @instance
         */
        Metadata.prototype.textDocumentEncoding = 0;

        /**
         * Creates a new Metadata instance using the specified properties.
         * @function create
         * @memberof scip.Metadata
         * @static
         * @param {scip.Metadata.$Properties=} [properties] Properties to set
         * @returns {scip.Metadata} Metadata instance
         * @type {{
         *   (properties: scip.Metadata.$Shape): scip.Metadata & scip.Metadata.$Shape;
         *   (properties?: scip.Metadata.$Properties): scip.Metadata;
         * }}
         */
        Metadata.create = function(properties) {
            return new Metadata(properties);
        };

        /**
         * Encodes the specified Metadata message. Does not implicitly {@link scip.Metadata.verify|verify} messages.
         * @function encode
         * @memberof scip.Metadata
         * @static
         * @param {scip.Metadata.$Properties} message Metadata message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Metadata.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.version != null && $Object.hasOwnProperty.call(message, "version") && message.version !== 0)
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.version);
            if (message.toolInfo != null && $Object.hasOwnProperty.call(message, "toolInfo"))
                $root.scip.ToolInfo.encode(message.toolInfo, writer.uint32(/* id 2, wireType 2 =*/18).fork(), _depth + 1).ldelim();
            if (message.projectRoot != null && $Object.hasOwnProperty.call(message, "projectRoot") && message.projectRoot !== "")
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.projectRoot);
            if (message.textDocumentEncoding != null && $Object.hasOwnProperty.call(message, "textDocumentEncoding") && message.textDocumentEncoding !== 0)
                writer.uint32(/* id 4, wireType 0 =*/32).int32(message.textDocumentEncoding);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified Metadata message, length delimited. Does not implicitly {@link scip.Metadata.verify|verify} messages.
         * @function encodeDelimited
         * @memberof scip.Metadata
         * @static
         * @param {scip.Metadata.$Properties} message Metadata message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Metadata.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a Metadata message from the specified reader or buffer.
         * @function decode
         * @memberof scip.Metadata
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {scip.Metadata & scip.Metadata.$Shape} Metadata
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Metadata.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.scip.Metadata(), value;
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.version = value;
                        else
                            delete message.version;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        message.toolInfo = $root.scip.ToolInfo.decode(reader, reader.uint32(), $undefined, _depth + 1, message.toolInfo);
                        continue;
                    }
                case 3: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.projectRoot = value;
                        else
                            delete message.projectRoot;
                        continue;
                    }
                case 4: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.textDocumentEncoding = value;
                        else
                            delete message.textDocumentEncoding;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a Metadata message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof scip.Metadata
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {scip.Metadata & scip.Metadata.$Shape} Metadata
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Metadata.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Metadata message.
         * @function verify
         * @memberof scip.Metadata
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Metadata.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.version != null && $Object.hasOwnProperty.call(message, "version"))
                if (typeof message.version !== "number" || (message.version | 0) !== message.version)
                    return "version: enum value expected";
            if (message.toolInfo != null && $Object.hasOwnProperty.call(message, "toolInfo")) {
                let error = $root.scip.ToolInfo.verify(message.toolInfo, _depth + 1);
                if (error)
                    return "toolInfo." + error;
            }
            if (message.projectRoot != null && $Object.hasOwnProperty.call(message, "projectRoot"))
                if (!$util.isString(message.projectRoot))
                    return "projectRoot: string expected";
            if (message.textDocumentEncoding != null && $Object.hasOwnProperty.call(message, "textDocumentEncoding"))
                if (typeof message.textDocumentEncoding !== "number" || (message.textDocumentEncoding | 0) !== message.textDocumentEncoding)
                    return "textDocumentEncoding: enum value expected";
            return null;
        };

        /**
         * Creates a Metadata message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof scip.Metadata
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {scip.Metadata} Metadata
         */
        Metadata.fromObject = function (object, _depth) {
            if (object instanceof $root.scip.Metadata)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".scip.Metadata: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.scip.Metadata();
            if (object.version !== 0 && (typeof object.version !== "string" || $root.scip.ProtocolVersion[object.version] !== 0))
                switch (object.version) {
                case "UnspecifiedProtocolVersion":
                case 0:
                    message.version = 0;
                    break;
                default:
                    if (typeof object.version === "number" && (object.version | 0) === object.version)
                        message.version = object.version;
                }
            if (object.toolInfo != null) {
                if (!$util.isObject(object.toolInfo))
                    throw $TypeError(".scip.Metadata.toolInfo: object expected");
                message.toolInfo = $root.scip.ToolInfo.fromObject(object.toolInfo, _depth + 1);
            }
            if (object.projectRoot != null)
                if (typeof object.projectRoot !== "string" || object.projectRoot.length)
                    message.projectRoot = $String(object.projectRoot);
            if (object.textDocumentEncoding !== 0 && (typeof object.textDocumentEncoding !== "string" || $root.scip.TextEncoding[object.textDocumentEncoding] !== 0))
                switch (object.textDocumentEncoding) {
                case "UnspecifiedTextEncoding":
                case 0:
                    message.textDocumentEncoding = 0;
                    break;
                case "UTF8":
                case 1:
                    message.textDocumentEncoding = 1;
                    break;
                case "UTF16":
                case 2:
                    message.textDocumentEncoding = 2;
                    break;
                default:
                    if (typeof object.textDocumentEncoding === "number" && (object.textDocumentEncoding | 0) === object.textDocumentEncoding)
                        message.textDocumentEncoding = object.textDocumentEncoding;
                }
            return message;
        };

        /**
         * Creates a plain object from a Metadata message. Also converts values to other types if specified.
         * @function toObject
         * @memberof scip.Metadata
         * @static
         * @param {scip.Metadata} message Metadata
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Metadata.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                object.version = options.enums === $String ? "UnspecifiedProtocolVersion" : 0;
                object.toolInfo = null;
                object.projectRoot = "";
                object.textDocumentEncoding = options.enums === $String ? "UnspecifiedTextEncoding" : 0;
            }
            if (message.version != null && $Object.hasOwnProperty.call(message, "version"))
                object.version = options.enums === $String ? $root.scip.ProtocolVersion[message.version] === $undefined ? message.version : $root.scip.ProtocolVersion[message.version] : message.version;
            if (message.toolInfo != null && $Object.hasOwnProperty.call(message, "toolInfo"))
                object.toolInfo = $root.scip.ToolInfo.toObject(message.toolInfo, options, _depth + 1);
            if (message.projectRoot != null && $Object.hasOwnProperty.call(message, "projectRoot"))
                object.projectRoot = message.projectRoot;
            if (message.textDocumentEncoding != null && $Object.hasOwnProperty.call(message, "textDocumentEncoding"))
                object.textDocumentEncoding = options.enums === $String ? $root.scip.TextEncoding[message.textDocumentEncoding] === $undefined ? message.textDocumentEncoding : $root.scip.TextEncoding[message.textDocumentEncoding] : message.textDocumentEncoding;
            return object;
        };

        /**
         * Converts this Metadata to JSON.
         * @function toJSON
         * @memberof scip.Metadata
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Metadata.prototype.toJSON = function() {
            return Metadata.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for Metadata
         * @function getTypeUrl
         * @memberof scip.Metadata
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        Metadata.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/scip.Metadata";
        };

        return Metadata;
    })();

    /**
     * ProtocolVersion enum.
     * @name scip.ProtocolVersion
     * @enum {number}
     * @property {number} UnspecifiedProtocolVersion=0 UnspecifiedProtocolVersion value
     */
    scip.ProtocolVersion = (function() {
        const valuesById = $Object.create(null), values = $Object.create(valuesById);
        values[valuesById[0] = "UnspecifiedProtocolVersion"] = 0;
        return values;
    })();

    /**
     * TextEncoding enum.
     * @name scip.TextEncoding
     * @enum {number}
     * @property {number} UnspecifiedTextEncoding=0 UnspecifiedTextEncoding value
     * @property {number} UTF8=1 UTF8 value
     * @property {number} UTF16=2 UTF16 value
     */
    scip.TextEncoding = (function() {
        const valuesById = $Object.create(null), values = $Object.create(valuesById);
        values[valuesById[0] = "UnspecifiedTextEncoding"] = 0;
        values[valuesById[1] = "UTF8"] = 1;
        values[valuesById[2] = "UTF16"] = 2;
        return values;
    })();

    scip.ToolInfo = (function() {

        /**
         * Properties of a ToolInfo.
         * @typedef {Object} scip.ToolInfo.$Properties
         * @property {string|null} [name] ToolInfo name
         * @property {string|null} [version] ToolInfo version
         * @property {Array.<string>|null} ["arguments"] ToolInfo arguments
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a ToolInfo.
         * @memberof scip
         * @interface IToolInfo
         * @augments scip.ToolInfo.$Properties
         * @deprecated Use scip.ToolInfo.$Properties instead.
         */

        /**
         * Shape of a ToolInfo.
         * @typedef {scip.ToolInfo.$Properties} scip.ToolInfo.$Shape
         */

        /**
         * Constructs a new ToolInfo.
         * @memberof scip
         * @classdesc Represents a ToolInfo.
         * @constructor
         * @param {scip.ToolInfo.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const ToolInfo = function (properties) {
            this["arguments"] = [];
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * ToolInfo name.
         * @member {string} name
         * @memberof scip.ToolInfo
         * @instance
         */
        ToolInfo.prototype.name = "";

        /**
         * ToolInfo version.
         * @member {string} version
         * @memberof scip.ToolInfo
         * @instance
         */
        ToolInfo.prototype.version = "";

        /**
         * ToolInfo arguments.
         * @member {Array.<string>} arguments
         * @memberof scip.ToolInfo
         * @instance
         */
        ToolInfo.prototype["arguments"] = $util.emptyArray;

        /**
         * Creates a new ToolInfo instance using the specified properties.
         * @function create
         * @memberof scip.ToolInfo
         * @static
         * @param {scip.ToolInfo.$Properties=} [properties] Properties to set
         * @returns {scip.ToolInfo} ToolInfo instance
         * @type {{
         *   (properties: scip.ToolInfo.$Shape): scip.ToolInfo & scip.ToolInfo.$Shape;
         *   (properties?: scip.ToolInfo.$Properties): scip.ToolInfo;
         * }}
         */
        ToolInfo.create = function(properties) {
            return new ToolInfo(properties);
        };

        /**
         * Encodes the specified ToolInfo message. Does not implicitly {@link scip.ToolInfo.verify|verify} messages.
         * @function encode
         * @memberof scip.ToolInfo
         * @static
         * @param {scip.ToolInfo.$Properties} message ToolInfo message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ToolInfo.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.name != null && $Object.hasOwnProperty.call(message, "name") && message.name !== "")
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.name);
            if (message.version != null && $Object.hasOwnProperty.call(message, "version") && message.version !== "")
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.version);
            if (message["arguments"] != null && message["arguments"].length)
                for (let i = 0; i < message["arguments"].length; ++i)
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message["arguments"][i]);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified ToolInfo message, length delimited. Does not implicitly {@link scip.ToolInfo.verify|verify} messages.
         * @function encodeDelimited
         * @memberof scip.ToolInfo
         * @static
         * @param {scip.ToolInfo.$Properties} message ToolInfo message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        ToolInfo.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a ToolInfo message from the specified reader or buffer.
         * @function decode
         * @memberof scip.ToolInfo
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {scip.ToolInfo & scip.ToolInfo.$Shape} ToolInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ToolInfo.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.scip.ToolInfo(), value;
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.name = value;
                        else
                            delete message.name;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.version = value;
                        else
                            delete message.version;
                        continue;
                    }
                case 3: {
                        if (wireType !== 2)
                            break;
                        if (!(message["arguments"] && message["arguments"].length))
                            message["arguments"] = [];
                        message["arguments"].push(reader.stringVerify());
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a ToolInfo message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof scip.ToolInfo
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {scip.ToolInfo & scip.ToolInfo.$Shape} ToolInfo
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        ToolInfo.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a ToolInfo message.
         * @function verify
         * @memberof scip.ToolInfo
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        ToolInfo.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.name != null && $Object.hasOwnProperty.call(message, "name"))
                if (!$util.isString(message.name))
                    return "name: string expected";
            if (message.version != null && $Object.hasOwnProperty.call(message, "version"))
                if (!$util.isString(message.version))
                    return "version: string expected";
            if (message["arguments"] != null && $Object.hasOwnProperty.call(message, "arguments")) {
                if (!$Array.isArray(message["arguments"]))
                    return "arguments: array expected";
                for (let i = 0; i < message["arguments"].length; ++i)
                    if (!$util.isString(message["arguments"][i]))
                        return "arguments: string[] expected";
            }
            return null;
        };

        /**
         * Creates a ToolInfo message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof scip.ToolInfo
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {scip.ToolInfo} ToolInfo
         */
        ToolInfo.fromObject = function (object, _depth) {
            if (object instanceof $root.scip.ToolInfo)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".scip.ToolInfo: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.scip.ToolInfo();
            if (object.name != null)
                if (typeof object.name !== "string" || object.name.length)
                    message.name = $String(object.name);
            if (object.version != null)
                if (typeof object.version !== "string" || object.version.length)
                    message.version = $String(object.version);
            if (object["arguments"]) {
                if (!$Array.isArray(object["arguments"]))
                    throw $TypeError(".scip.ToolInfo.arguments: array expected");
                message["arguments"] = $Array(object["arguments"].length);
                for (let i = 0; i < object["arguments"].length; ++i)
                    message["arguments"][i] = $String(object["arguments"][i]);
            }
            return message;
        };

        /**
         * Creates a plain object from a ToolInfo message. Also converts values to other types if specified.
         * @function toObject
         * @memberof scip.ToolInfo
         * @static
         * @param {scip.ToolInfo} message ToolInfo
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        ToolInfo.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.arrays || options.defaults)
                object["arguments"] = [];
            if (options.defaults) {
                object.name = "";
                object.version = "";
            }
            if (message.name != null && $Object.hasOwnProperty.call(message, "name"))
                object.name = message.name;
            if (message.version != null && $Object.hasOwnProperty.call(message, "version"))
                object.version = message.version;
            if (message["arguments"] && message["arguments"].length) {
                object["arguments"] = $Array(message["arguments"].length);
                for (let j = 0; j < message["arguments"].length; ++j)
                    object["arguments"][j] = message["arguments"][j];
            }
            return object;
        };

        /**
         * Converts this ToolInfo to JSON.
         * @function toJSON
         * @memberof scip.ToolInfo
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        ToolInfo.prototype.toJSON = function() {
            return ToolInfo.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for ToolInfo
         * @function getTypeUrl
         * @memberof scip.ToolInfo
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        ToolInfo.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/scip.ToolInfo";
        };

        return ToolInfo;
    })();

    scip.Document = (function() {

        /**
         * Properties of a Document.
         * @typedef {Object} scip.Document.$Properties
         * @property {string|null} [language] Document language
         * @property {string|null} [relativePath] Document relativePath
         * @property {Array.<scip.Occurrence.$Properties>|null} [occurrences] Document occurrences
         * @property {Array.<scip.SymbolInformation.$Properties>|null} [symbols] Document symbols
         * @property {string|null} [text] Document text
         * @property {scip.PositionEncoding|null} [positionEncoding] Document positionEncoding
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a Document.
         * @memberof scip
         * @interface IDocument
         * @augments scip.Document.$Properties
         * @deprecated Use scip.Document.$Properties instead.
         */

        /**
         * Shape of a Document.
         * @typedef {{
         *   language?: string|null;
         *   relativePath?: string|null;
         *   occurrences?: Array.<scip.Occurrence.$Shape>|null;
         *   symbols?: Array.<scip.SymbolInformation.$Shape>|null;
         *   text?: string|null;
         *   positionEncoding?: scip.PositionEncoding|null;
         *   $unknowns?: Array.<Uint8Array>;
         * }} scip.Document.$Shape
         */

        /**
         * Constructs a new Document.
         * @memberof scip
         * @classdesc Represents a Document.
         * @constructor
         * @param {scip.Document.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const Document = function (properties) {
            this.occurrences = [];
            this.symbols = [];
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * Document language.
         * @member {string} language
         * @memberof scip.Document
         * @instance
         */
        Document.prototype.language = "";

        /**
         * Document relativePath.
         * @member {string} relativePath
         * @memberof scip.Document
         * @instance
         */
        Document.prototype.relativePath = "";

        /**
         * Document occurrences.
         * @member {Array.<scip.Occurrence.$Properties>} occurrences
         * @memberof scip.Document
         * @instance
         */
        Document.prototype.occurrences = $util.emptyArray;

        /**
         * Document symbols.
         * @member {Array.<scip.SymbolInformation.$Properties>} symbols
         * @memberof scip.Document
         * @instance
         */
        Document.prototype.symbols = $util.emptyArray;

        /**
         * Document text.
         * @member {string} text
         * @memberof scip.Document
         * @instance
         */
        Document.prototype.text = "";

        /**
         * Document positionEncoding.
         * @member {scip.PositionEncoding} positionEncoding
         * @memberof scip.Document
         * @instance
         */
        Document.prototype.positionEncoding = 0;

        /**
         * Creates a new Document instance using the specified properties.
         * @function create
         * @memberof scip.Document
         * @static
         * @param {scip.Document.$Properties=} [properties] Properties to set
         * @returns {scip.Document} Document instance
         * @type {{
         *   (properties: scip.Document.$Shape): scip.Document & scip.Document.$Shape;
         *   (properties?: scip.Document.$Properties): scip.Document;
         * }}
         */
        Document.create = function(properties) {
            return new Document(properties);
        };

        /**
         * Encodes the specified Document message. Does not implicitly {@link scip.Document.verify|verify} messages.
         * @function encode
         * @memberof scip.Document
         * @static
         * @param {scip.Document.$Properties} message Document message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Document.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.relativePath != null && $Object.hasOwnProperty.call(message, "relativePath") && message.relativePath !== "")
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.relativePath);
            if (message.occurrences != null && message.occurrences.length)
                for (let i = 0; i < message.occurrences.length; ++i)
                    $root.scip.Occurrence.encode(message.occurrences[i], writer.uint32(/* id 2, wireType 2 =*/18).fork(), _depth + 1).ldelim();
            if (message.symbols != null && message.symbols.length)
                for (let i = 0; i < message.symbols.length; ++i)
                    $root.scip.SymbolInformation.encode(message.symbols[i], writer.uint32(/* id 3, wireType 2 =*/26).fork(), _depth + 1).ldelim();
            if (message.language != null && $Object.hasOwnProperty.call(message, "language") && message.language !== "")
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.language);
            if (message.text != null && $Object.hasOwnProperty.call(message, "text") && message.text !== "")
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.text);
            if (message.positionEncoding != null && $Object.hasOwnProperty.call(message, "positionEncoding") && message.positionEncoding !== 0)
                writer.uint32(/* id 6, wireType 0 =*/48).int32(message.positionEncoding);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified Document message, length delimited. Does not implicitly {@link scip.Document.verify|verify} messages.
         * @function encodeDelimited
         * @memberof scip.Document
         * @static
         * @param {scip.Document.$Properties} message Document message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Document.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a Document message from the specified reader or buffer.
         * @function decode
         * @memberof scip.Document
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {scip.Document & scip.Document.$Shape} Document
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Document.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.scip.Document(), value;
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 4: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.language = value;
                        else
                            delete message.language;
                        continue;
                    }
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.relativePath = value;
                        else
                            delete message.relativePath;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if (!(message.occurrences && message.occurrences.length))
                            message.occurrences = [];
                        message.occurrences.push($root.scip.Occurrence.decode(reader, reader.uint32(), $undefined, _depth + 1));
                        continue;
                    }
                case 3: {
                        if (wireType !== 2)
                            break;
                        if (!(message.symbols && message.symbols.length))
                            message.symbols = [];
                        message.symbols.push($root.scip.SymbolInformation.decode(reader, reader.uint32(), $undefined, _depth + 1));
                        continue;
                    }
                case 5: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.text = value;
                        else
                            delete message.text;
                        continue;
                    }
                case 6: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.positionEncoding = value;
                        else
                            delete message.positionEncoding;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a Document message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof scip.Document
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {scip.Document & scip.Document.$Shape} Document
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Document.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Document message.
         * @function verify
         * @memberof scip.Document
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Document.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.language != null && $Object.hasOwnProperty.call(message, "language"))
                if (!$util.isString(message.language))
                    return "language: string expected";
            if (message.relativePath != null && $Object.hasOwnProperty.call(message, "relativePath"))
                if (!$util.isString(message.relativePath))
                    return "relativePath: string expected";
            if (message.occurrences != null && $Object.hasOwnProperty.call(message, "occurrences")) {
                if (!$Array.isArray(message.occurrences))
                    return "occurrences: array expected";
                for (let i = 0; i < message.occurrences.length; ++i) {
                    let error = $root.scip.Occurrence.verify(message.occurrences[i], _depth + 1);
                    if (error)
                        return "occurrences." + error;
                }
            }
            if (message.symbols != null && $Object.hasOwnProperty.call(message, "symbols")) {
                if (!$Array.isArray(message.symbols))
                    return "symbols: array expected";
                for (let i = 0; i < message.symbols.length; ++i) {
                    let error = $root.scip.SymbolInformation.verify(message.symbols[i], _depth + 1);
                    if (error)
                        return "symbols." + error;
                }
            }
            if (message.text != null && $Object.hasOwnProperty.call(message, "text"))
                if (!$util.isString(message.text))
                    return "text: string expected";
            if (message.positionEncoding != null && $Object.hasOwnProperty.call(message, "positionEncoding"))
                if (typeof message.positionEncoding !== "number" || (message.positionEncoding | 0) !== message.positionEncoding)
                    return "positionEncoding: enum value expected";
            return null;
        };

        /**
         * Creates a Document message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof scip.Document
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {scip.Document} Document
         */
        Document.fromObject = function (object, _depth) {
            if (object instanceof $root.scip.Document)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".scip.Document: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.scip.Document();
            if (object.language != null)
                if (typeof object.language !== "string" || object.language.length)
                    message.language = $String(object.language);
            if (object.relativePath != null)
                if (typeof object.relativePath !== "string" || object.relativePath.length)
                    message.relativePath = $String(object.relativePath);
            if (object.occurrences) {
                if (!$Array.isArray(object.occurrences))
                    throw $TypeError(".scip.Document.occurrences: array expected");
                message.occurrences = $Array(object.occurrences.length);
                for (let i = 0; i < object.occurrences.length; ++i) {
                    if (!$util.isObject(object.occurrences[i]))
                        throw $TypeError(".scip.Document.occurrences: object expected");
                    message.occurrences[i] = $root.scip.Occurrence.fromObject(object.occurrences[i], _depth + 1);
                }
            }
            if (object.symbols) {
                if (!$Array.isArray(object.symbols))
                    throw $TypeError(".scip.Document.symbols: array expected");
                message.symbols = $Array(object.symbols.length);
                for (let i = 0; i < object.symbols.length; ++i) {
                    if (!$util.isObject(object.symbols[i]))
                        throw $TypeError(".scip.Document.symbols: object expected");
                    message.symbols[i] = $root.scip.SymbolInformation.fromObject(object.symbols[i], _depth + 1);
                }
            }
            if (object.text != null)
                if (typeof object.text !== "string" || object.text.length)
                    message.text = $String(object.text);
            if (object.positionEncoding !== 0 && (typeof object.positionEncoding !== "string" || $root.scip.PositionEncoding[object.positionEncoding] !== 0))
                switch (object.positionEncoding) {
                case "UnspecifiedPositionEncoding":
                case 0:
                    message.positionEncoding = 0;
                    break;
                case "UTF8CodeUnitOffsetFromLineStart":
                case 1:
                    message.positionEncoding = 1;
                    break;
                case "UTF16CodeUnitOffsetFromLineStart":
                case 2:
                    message.positionEncoding = 2;
                    break;
                case "UTF32CodeUnitOffsetFromLineStart":
                case 3:
                    message.positionEncoding = 3;
                    break;
                default:
                    if (typeof object.positionEncoding === "number" && (object.positionEncoding | 0) === object.positionEncoding)
                        message.positionEncoding = object.positionEncoding;
                }
            return message;
        };

        /**
         * Creates a plain object from a Document message. Also converts values to other types if specified.
         * @function toObject
         * @memberof scip.Document
         * @static
         * @param {scip.Document} message Document
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Document.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.arrays || options.defaults) {
                object.occurrences = [];
                object.symbols = [];
            }
            if (options.defaults) {
                object.relativePath = "";
                object.language = "";
                object.text = "";
                object.positionEncoding = options.enums === $String ? "UnspecifiedPositionEncoding" : 0;
            }
            if (message.relativePath != null && $Object.hasOwnProperty.call(message, "relativePath"))
                object.relativePath = message.relativePath;
            if (message.occurrences && message.occurrences.length) {
                object.occurrences = $Array(message.occurrences.length);
                for (let j = 0; j < message.occurrences.length; ++j)
                    object.occurrences[j] = $root.scip.Occurrence.toObject(message.occurrences[j], options, _depth + 1);
            }
            if (message.symbols && message.symbols.length) {
                object.symbols = $Array(message.symbols.length);
                for (let j = 0; j < message.symbols.length; ++j)
                    object.symbols[j] = $root.scip.SymbolInformation.toObject(message.symbols[j], options, _depth + 1);
            }
            if (message.language != null && $Object.hasOwnProperty.call(message, "language"))
                object.language = message.language;
            if (message.text != null && $Object.hasOwnProperty.call(message, "text"))
                object.text = message.text;
            if (message.positionEncoding != null && $Object.hasOwnProperty.call(message, "positionEncoding"))
                object.positionEncoding = options.enums === $String ? $root.scip.PositionEncoding[message.positionEncoding] === $undefined ? message.positionEncoding : $root.scip.PositionEncoding[message.positionEncoding] : message.positionEncoding;
            return object;
        };

        /**
         * Converts this Document to JSON.
         * @function toJSON
         * @memberof scip.Document
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Document.prototype.toJSON = function() {
            return Document.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for Document
         * @function getTypeUrl
         * @memberof scip.Document
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        Document.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/scip.Document";
        };

        return Document;
    })();

    /**
     * PositionEncoding enum.
     * @name scip.PositionEncoding
     * @enum {number}
     * @property {number} UnspecifiedPositionEncoding=0 UnspecifiedPositionEncoding value
     * @property {number} UTF8CodeUnitOffsetFromLineStart=1 UTF8CodeUnitOffsetFromLineStart value
     * @property {number} UTF16CodeUnitOffsetFromLineStart=2 UTF16CodeUnitOffsetFromLineStart value
     * @property {number} UTF32CodeUnitOffsetFromLineStart=3 UTF32CodeUnitOffsetFromLineStart value
     */
    scip.PositionEncoding = (function() {
        const valuesById = $Object.create(null), values = $Object.create(valuesById);
        values[valuesById[0] = "UnspecifiedPositionEncoding"] = 0;
        values[valuesById[1] = "UTF8CodeUnitOffsetFromLineStart"] = 1;
        values[valuesById[2] = "UTF16CodeUnitOffsetFromLineStart"] = 2;
        values[valuesById[3] = "UTF32CodeUnitOffsetFromLineStart"] = 3;
        return values;
    })();

    scip.Symbol = (function() {

        /**
         * Properties of a Symbol.
         * @typedef {Object} scip.Symbol.$Properties
         * @property {string|null} [scheme] Symbol scheme
         * @property {scip.Package.$Properties|null} ["package"] Symbol package
         * @property {Array.<scip.Descriptor.$Properties>|null} [descriptors] Symbol descriptors
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a Symbol.
         * @memberof scip
         * @interface ISymbol
         * @augments scip.Symbol.$Properties
         * @deprecated Use scip.Symbol.$Properties instead.
         */

        /**
         * Shape of a Symbol.
         * @typedef {scip.Symbol.$Properties} scip.Symbol.$Shape
         */

        /**
         * Constructs a new Symbol.
         * @memberof scip
         * @classdesc Represents a Symbol.
         * @constructor
         * @param {scip.Symbol.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const Symbol = function (properties) {
            this.descriptors = [];
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * Symbol scheme.
         * @member {string} scheme
         * @memberof scip.Symbol
         * @instance
         */
        Symbol.prototype.scheme = "";

        /**
         * Symbol package.
         * @member {scip.Package.$Properties|null|undefined} package
         * @memberof scip.Symbol
         * @instance
         */
        Symbol.prototype["package"] = null;

        /**
         * Symbol descriptors.
         * @member {Array.<scip.Descriptor.$Properties>} descriptors
         * @memberof scip.Symbol
         * @instance
         */
        Symbol.prototype.descriptors = $util.emptyArray;

        /**
         * Creates a new Symbol instance using the specified properties.
         * @function create
         * @memberof scip.Symbol
         * @static
         * @param {scip.Symbol.$Properties=} [properties] Properties to set
         * @returns {scip.Symbol} Symbol instance
         * @type {{
         *   (properties: scip.Symbol.$Shape): scip.Symbol & scip.Symbol.$Shape;
         *   (properties?: scip.Symbol.$Properties): scip.Symbol;
         * }}
         */
        Symbol.create = function(properties) {
            return new Symbol(properties);
        };

        /**
         * Encodes the specified Symbol message. Does not implicitly {@link scip.Symbol.verify|verify} messages.
         * @function encode
         * @memberof scip.Symbol
         * @static
         * @param {scip.Symbol.$Properties} message Symbol message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Symbol.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.scheme != null && $Object.hasOwnProperty.call(message, "scheme") && message.scheme !== "")
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.scheme);
            if (message["package"] != null && $Object.hasOwnProperty.call(message, "package"))
                $root.scip.Package.encode(message["package"], writer.uint32(/* id 2, wireType 2 =*/18).fork(), _depth + 1).ldelim();
            if (message.descriptors != null && message.descriptors.length)
                for (let i = 0; i < message.descriptors.length; ++i)
                    $root.scip.Descriptor.encode(message.descriptors[i], writer.uint32(/* id 3, wireType 2 =*/26).fork(), _depth + 1).ldelim();
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified Symbol message, length delimited. Does not implicitly {@link scip.Symbol.verify|verify} messages.
         * @function encodeDelimited
         * @memberof scip.Symbol
         * @static
         * @param {scip.Symbol.$Properties} message Symbol message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Symbol.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a Symbol message from the specified reader or buffer.
         * @function decode
         * @memberof scip.Symbol
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {scip.Symbol & scip.Symbol.$Shape} Symbol
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Symbol.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.scip.Symbol(), value;
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.scheme = value;
                        else
                            delete message.scheme;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        message["package"] = $root.scip.Package.decode(reader, reader.uint32(), $undefined, _depth + 1, message["package"]);
                        continue;
                    }
                case 3: {
                        if (wireType !== 2)
                            break;
                        if (!(message.descriptors && message.descriptors.length))
                            message.descriptors = [];
                        message.descriptors.push($root.scip.Descriptor.decode(reader, reader.uint32(), $undefined, _depth + 1));
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a Symbol message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof scip.Symbol
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {scip.Symbol & scip.Symbol.$Shape} Symbol
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Symbol.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Symbol message.
         * @function verify
         * @memberof scip.Symbol
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Symbol.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.scheme != null && $Object.hasOwnProperty.call(message, "scheme"))
                if (!$util.isString(message.scheme))
                    return "scheme: string expected";
            if (message["package"] != null && $Object.hasOwnProperty.call(message, "package")) {
                let error = $root.scip.Package.verify(message["package"], _depth + 1);
                if (error)
                    return "package." + error;
            }
            if (message.descriptors != null && $Object.hasOwnProperty.call(message, "descriptors")) {
                if (!$Array.isArray(message.descriptors))
                    return "descriptors: array expected";
                for (let i = 0; i < message.descriptors.length; ++i) {
                    let error = $root.scip.Descriptor.verify(message.descriptors[i], _depth + 1);
                    if (error)
                        return "descriptors." + error;
                }
            }
            return null;
        };

        /**
         * Creates a Symbol message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof scip.Symbol
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {scip.Symbol} Symbol
         */
        Symbol.fromObject = function (object, _depth) {
            if (object instanceof $root.scip.Symbol)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".scip.Symbol: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.scip.Symbol();
            if (object.scheme != null)
                if (typeof object.scheme !== "string" || object.scheme.length)
                    message.scheme = $String(object.scheme);
            if (object["package"] != null) {
                if (!$util.isObject(object["package"]))
                    throw $TypeError(".scip.Symbol.package: object expected");
                message["package"] = $root.scip.Package.fromObject(object["package"], _depth + 1);
            }
            if (object.descriptors) {
                if (!$Array.isArray(object.descriptors))
                    throw $TypeError(".scip.Symbol.descriptors: array expected");
                message.descriptors = $Array(object.descriptors.length);
                for (let i = 0; i < object.descriptors.length; ++i) {
                    if (!$util.isObject(object.descriptors[i]))
                        throw $TypeError(".scip.Symbol.descriptors: object expected");
                    message.descriptors[i] = $root.scip.Descriptor.fromObject(object.descriptors[i], _depth + 1);
                }
            }
            return message;
        };

        /**
         * Creates a plain object from a Symbol message. Also converts values to other types if specified.
         * @function toObject
         * @memberof scip.Symbol
         * @static
         * @param {scip.Symbol} message Symbol
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Symbol.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.arrays || options.defaults)
                object.descriptors = [];
            if (options.defaults) {
                object.scheme = "";
                object["package"] = null;
            }
            if (message.scheme != null && $Object.hasOwnProperty.call(message, "scheme"))
                object.scheme = message.scheme;
            if (message["package"] != null && $Object.hasOwnProperty.call(message, "package"))
                object["package"] = $root.scip.Package.toObject(message["package"], options, _depth + 1);
            if (message.descriptors && message.descriptors.length) {
                object.descriptors = $Array(message.descriptors.length);
                for (let j = 0; j < message.descriptors.length; ++j)
                    object.descriptors[j] = $root.scip.Descriptor.toObject(message.descriptors[j], options, _depth + 1);
            }
            return object;
        };

        /**
         * Converts this Symbol to JSON.
         * @function toJSON
         * @memberof scip.Symbol
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Symbol.prototype.toJSON = function() {
            return Symbol.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for Symbol
         * @function getTypeUrl
         * @memberof scip.Symbol
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        Symbol.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/scip.Symbol";
        };

        return Symbol;
    })();

    scip.Package = (function() {

        /**
         * Properties of a Package.
         * @typedef {Object} scip.Package.$Properties
         * @property {string|null} [manager] Package manager
         * @property {string|null} [name] Package name
         * @property {string|null} [version] Package version
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a Package.
         * @memberof scip
         * @interface IPackage
         * @augments scip.Package.$Properties
         * @deprecated Use scip.Package.$Properties instead.
         */

        /**
         * Shape of a Package.
         * @typedef {scip.Package.$Properties} scip.Package.$Shape
         */

        /**
         * Constructs a new Package.
         * @memberof scip
         * @classdesc Represents a Package.
         * @constructor
         * @param {scip.Package.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const Package = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * Package manager.
         * @member {string} manager
         * @memberof scip.Package
         * @instance
         */
        Package.prototype.manager = "";

        /**
         * Package name.
         * @member {string} name
         * @memberof scip.Package
         * @instance
         */
        Package.prototype.name = "";

        /**
         * Package version.
         * @member {string} version
         * @memberof scip.Package
         * @instance
         */
        Package.prototype.version = "";

        /**
         * Creates a new Package instance using the specified properties.
         * @function create
         * @memberof scip.Package
         * @static
         * @param {scip.Package.$Properties=} [properties] Properties to set
         * @returns {scip.Package} Package instance
         * @type {{
         *   (properties: scip.Package.$Shape): scip.Package & scip.Package.$Shape;
         *   (properties?: scip.Package.$Properties): scip.Package;
         * }}
         */
        Package.create = function(properties) {
            return new Package(properties);
        };

        /**
         * Encodes the specified Package message. Does not implicitly {@link scip.Package.verify|verify} messages.
         * @function encode
         * @memberof scip.Package
         * @static
         * @param {scip.Package.$Properties} message Package message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Package.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.manager != null && $Object.hasOwnProperty.call(message, "manager") && message.manager !== "")
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.manager);
            if (message.name != null && $Object.hasOwnProperty.call(message, "name") && message.name !== "")
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.name);
            if (message.version != null && $Object.hasOwnProperty.call(message, "version") && message.version !== "")
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.version);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified Package message, length delimited. Does not implicitly {@link scip.Package.verify|verify} messages.
         * @function encodeDelimited
         * @memberof scip.Package
         * @static
         * @param {scip.Package.$Properties} message Package message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Package.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a Package message from the specified reader or buffer.
         * @function decode
         * @memberof scip.Package
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {scip.Package & scip.Package.$Shape} Package
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Package.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.scip.Package(), value;
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.manager = value;
                        else
                            delete message.manager;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.name = value;
                        else
                            delete message.name;
                        continue;
                    }
                case 3: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.version = value;
                        else
                            delete message.version;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a Package message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof scip.Package
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {scip.Package & scip.Package.$Shape} Package
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Package.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Package message.
         * @function verify
         * @memberof scip.Package
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Package.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.manager != null && $Object.hasOwnProperty.call(message, "manager"))
                if (!$util.isString(message.manager))
                    return "manager: string expected";
            if (message.name != null && $Object.hasOwnProperty.call(message, "name"))
                if (!$util.isString(message.name))
                    return "name: string expected";
            if (message.version != null && $Object.hasOwnProperty.call(message, "version"))
                if (!$util.isString(message.version))
                    return "version: string expected";
            return null;
        };

        /**
         * Creates a Package message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof scip.Package
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {scip.Package} Package
         */
        Package.fromObject = function (object, _depth) {
            if (object instanceof $root.scip.Package)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".scip.Package: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.scip.Package();
            if (object.manager != null)
                if (typeof object.manager !== "string" || object.manager.length)
                    message.manager = $String(object.manager);
            if (object.name != null)
                if (typeof object.name !== "string" || object.name.length)
                    message.name = $String(object.name);
            if (object.version != null)
                if (typeof object.version !== "string" || object.version.length)
                    message.version = $String(object.version);
            return message;
        };

        /**
         * Creates a plain object from a Package message. Also converts values to other types if specified.
         * @function toObject
         * @memberof scip.Package
         * @static
         * @param {scip.Package} message Package
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Package.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                object.manager = "";
                object.name = "";
                object.version = "";
            }
            if (message.manager != null && $Object.hasOwnProperty.call(message, "manager"))
                object.manager = message.manager;
            if (message.name != null && $Object.hasOwnProperty.call(message, "name"))
                object.name = message.name;
            if (message.version != null && $Object.hasOwnProperty.call(message, "version"))
                object.version = message.version;
            return object;
        };

        /**
         * Converts this Package to JSON.
         * @function toJSON
         * @memberof scip.Package
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Package.prototype.toJSON = function() {
            return Package.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for Package
         * @function getTypeUrl
         * @memberof scip.Package
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        Package.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/scip.Package";
        };

        return Package;
    })();

    scip.Descriptor = (function() {

        /**
         * Properties of a Descriptor.
         * @typedef {Object} scip.Descriptor.$Properties
         * @property {string|null} [name] Descriptor name
         * @property {string|null} [disambiguator] Descriptor disambiguator
         * @property {scip.Descriptor.Suffix|null} [suffix] Descriptor suffix
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a Descriptor.
         * @memberof scip
         * @interface IDescriptor
         * @augments scip.Descriptor.$Properties
         * @deprecated Use scip.Descriptor.$Properties instead.
         */

        /**
         * Shape of a Descriptor.
         * @typedef {scip.Descriptor.$Properties} scip.Descriptor.$Shape
         */

        /**
         * Constructs a new Descriptor.
         * @memberof scip
         * @classdesc Represents a Descriptor.
         * @constructor
         * @param {scip.Descriptor.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const Descriptor = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * Descriptor name.
         * @member {string} name
         * @memberof scip.Descriptor
         * @instance
         */
        Descriptor.prototype.name = "";

        /**
         * Descriptor disambiguator.
         * @member {string} disambiguator
         * @memberof scip.Descriptor
         * @instance
         */
        Descriptor.prototype.disambiguator = "";

        /**
         * Descriptor suffix.
         * @member {scip.Descriptor.Suffix} suffix
         * @memberof scip.Descriptor
         * @instance
         */
        Descriptor.prototype.suffix = 0;

        /**
         * Creates a new Descriptor instance using the specified properties.
         * @function create
         * @memberof scip.Descriptor
         * @static
         * @param {scip.Descriptor.$Properties=} [properties] Properties to set
         * @returns {scip.Descriptor} Descriptor instance
         * @type {{
         *   (properties: scip.Descriptor.$Shape): scip.Descriptor & scip.Descriptor.$Shape;
         *   (properties?: scip.Descriptor.$Properties): scip.Descriptor;
         * }}
         */
        Descriptor.create = function(properties) {
            return new Descriptor(properties);
        };

        /**
         * Encodes the specified Descriptor message. Does not implicitly {@link scip.Descriptor.verify|verify} messages.
         * @function encode
         * @memberof scip.Descriptor
         * @static
         * @param {scip.Descriptor.$Properties} message Descriptor message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Descriptor.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.name != null && $Object.hasOwnProperty.call(message, "name") && message.name !== "")
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.name);
            if (message.disambiguator != null && $Object.hasOwnProperty.call(message, "disambiguator") && message.disambiguator !== "")
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.disambiguator);
            if (message.suffix != null && $Object.hasOwnProperty.call(message, "suffix") && message.suffix !== 0)
                writer.uint32(/* id 3, wireType 0 =*/24).int32(message.suffix);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified Descriptor message, length delimited. Does not implicitly {@link scip.Descriptor.verify|verify} messages.
         * @function encodeDelimited
         * @memberof scip.Descriptor
         * @static
         * @param {scip.Descriptor.$Properties} message Descriptor message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Descriptor.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a Descriptor message from the specified reader or buffer.
         * @function decode
         * @memberof scip.Descriptor
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {scip.Descriptor & scip.Descriptor.$Shape} Descriptor
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Descriptor.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.scip.Descriptor(), value;
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.name = value;
                        else
                            delete message.name;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.disambiguator = value;
                        else
                            delete message.disambiguator;
                        continue;
                    }
                case 3: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.suffix = value;
                        else
                            delete message.suffix;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a Descriptor message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof scip.Descriptor
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {scip.Descriptor & scip.Descriptor.$Shape} Descriptor
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Descriptor.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Descriptor message.
         * @function verify
         * @memberof scip.Descriptor
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Descriptor.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.name != null && $Object.hasOwnProperty.call(message, "name"))
                if (!$util.isString(message.name))
                    return "name: string expected";
            if (message.disambiguator != null && $Object.hasOwnProperty.call(message, "disambiguator"))
                if (!$util.isString(message.disambiguator))
                    return "disambiguator: string expected";
            if (message.suffix != null && $Object.hasOwnProperty.call(message, "suffix"))
                if (typeof message.suffix !== "number" || (message.suffix | 0) !== message.suffix)
                    return "suffix: enum value expected";
            return null;
        };

        /**
         * Creates a Descriptor message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof scip.Descriptor
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {scip.Descriptor} Descriptor
         */
        Descriptor.fromObject = function (object, _depth) {
            if (object instanceof $root.scip.Descriptor)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".scip.Descriptor: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.scip.Descriptor();
            if (object.name != null)
                if (typeof object.name !== "string" || object.name.length)
                    message.name = $String(object.name);
            if (object.disambiguator != null)
                if (typeof object.disambiguator !== "string" || object.disambiguator.length)
                    message.disambiguator = $String(object.disambiguator);
            if (object.suffix !== 0 && (typeof object.suffix !== "string" || $root.scip.Descriptor.Suffix[object.suffix] !== 0))
                switch (object.suffix) {
                case "UnspecifiedSuffix":
                case 0:
                    message.suffix = 0;
                    break;
                case "Namespace":
                case 1:
                    message.suffix = 1;
                    break;
                case "Package":
                case 1:
                    message.suffix = 1;
                    break;
                case "Type":
                case 2:
                    message.suffix = 2;
                    break;
                case "Term":
                case 3:
                    message.suffix = 3;
                    break;
                case "Method":
                case 4:
                    message.suffix = 4;
                    break;
                case "TypeParameter":
                case 5:
                    message.suffix = 5;
                    break;
                case "Parameter":
                case 6:
                    message.suffix = 6;
                    break;
                case "Meta":
                case 7:
                    message.suffix = 7;
                    break;
                case "Local":
                case 8:
                    message.suffix = 8;
                    break;
                case "Macro":
                case 9:
                    message.suffix = 9;
                    break;
                default:
                    if (typeof object.suffix === "number" && (object.suffix | 0) === object.suffix)
                        message.suffix = object.suffix;
                }
            return message;
        };

        /**
         * Creates a plain object from a Descriptor message. Also converts values to other types if specified.
         * @function toObject
         * @memberof scip.Descriptor
         * @static
         * @param {scip.Descriptor} message Descriptor
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Descriptor.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                object.name = "";
                object.disambiguator = "";
                object.suffix = options.enums === $String ? "UnspecifiedSuffix" : 0;
            }
            if (message.name != null && $Object.hasOwnProperty.call(message, "name"))
                object.name = message.name;
            if (message.disambiguator != null && $Object.hasOwnProperty.call(message, "disambiguator"))
                object.disambiguator = message.disambiguator;
            if (message.suffix != null && $Object.hasOwnProperty.call(message, "suffix"))
                object.suffix = options.enums === $String ? $root.scip.Descriptor.Suffix[message.suffix] === $undefined ? message.suffix : $root.scip.Descriptor.Suffix[message.suffix] : message.suffix;
            return object;
        };

        /**
         * Converts this Descriptor to JSON.
         * @function toJSON
         * @memberof scip.Descriptor
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Descriptor.prototype.toJSON = function() {
            return Descriptor.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for Descriptor
         * @function getTypeUrl
         * @memberof scip.Descriptor
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        Descriptor.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/scip.Descriptor";
        };

        /**
         * Suffix enum.
         * @name scip.Descriptor.Suffix
         * @enum {number}
         * @property {number} UnspecifiedSuffix=0 UnspecifiedSuffix value
         * @property {number} Namespace=1 Namespace value
         * @property {number} Package=1 Package value
         * @property {number} Type=2 Type value
         * @property {number} Term=3 Term value
         * @property {number} Method=4 Method value
         * @property {number} TypeParameter=5 TypeParameter value
         * @property {number} Parameter=6 Parameter value
         * @property {number} Meta=7 Meta value
         * @property {number} Local=8 Local value
         * @property {number} Macro=9 Macro value
         */
        Descriptor.Suffix = (function() {
            const valuesById = $Object.create(null), values = $Object.create(valuesById);
            values[valuesById[0] = "UnspecifiedSuffix"] = 0;
            values[valuesById[1] = "Namespace"] = 1;
            values["Package"] = 1;
            values[valuesById[2] = "Type"] = 2;
            values[valuesById[3] = "Term"] = 3;
            values[valuesById[4] = "Method"] = 4;
            values[valuesById[5] = "TypeParameter"] = 5;
            values[valuesById[6] = "Parameter"] = 6;
            values[valuesById[7] = "Meta"] = 7;
            values[valuesById[8] = "Local"] = 8;
            values[valuesById[9] = "Macro"] = 9;
            return values;
        })();

        return Descriptor;
    })();

    scip.Signature = (function() {

        /**
         * Properties of a Signature.
         * @typedef {Object} scip.Signature.$Properties
         * @property {string|null} [language] Signature language
         * @property {string|null} [text] Signature text
         * @property {Array.<scip.Occurrence.$Properties>|null} [occurrences] Signature occurrences
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a Signature.
         * @memberof scip
         * @interface ISignature
         * @augments scip.Signature.$Properties
         * @deprecated Use scip.Signature.$Properties instead.
         */

        /**
         * Shape of a Signature.
         * @typedef {{
         *   language?: string|null;
         *   text?: string|null;
         *   occurrences?: Array.<scip.Occurrence.$Shape>|null;
         *   $unknowns?: Array.<Uint8Array>;
         * }} scip.Signature.$Shape
         */

        /**
         * Constructs a new Signature.
         * @memberof scip
         * @classdesc Represents a Signature.
         * @constructor
         * @param {scip.Signature.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const Signature = function (properties) {
            this.occurrences = [];
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * Signature language.
         * @member {string} language
         * @memberof scip.Signature
         * @instance
         */
        Signature.prototype.language = "";

        /**
         * Signature text.
         * @member {string} text
         * @memberof scip.Signature
         * @instance
         */
        Signature.prototype.text = "";

        /**
         * Signature occurrences.
         * @member {Array.<scip.Occurrence.$Properties>} occurrences
         * @memberof scip.Signature
         * @instance
         */
        Signature.prototype.occurrences = $util.emptyArray;

        /**
         * Creates a new Signature instance using the specified properties.
         * @function create
         * @memberof scip.Signature
         * @static
         * @param {scip.Signature.$Properties=} [properties] Properties to set
         * @returns {scip.Signature} Signature instance
         * @type {{
         *   (properties: scip.Signature.$Shape): scip.Signature & scip.Signature.$Shape;
         *   (properties?: scip.Signature.$Properties): scip.Signature;
         * }}
         */
        Signature.create = function(properties) {
            return new Signature(properties);
        };

        /**
         * Encodes the specified Signature message. Does not implicitly {@link scip.Signature.verify|verify} messages.
         * @function encode
         * @memberof scip.Signature
         * @static
         * @param {scip.Signature.$Properties} message Signature message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Signature.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.occurrences != null && message.occurrences.length)
                for (let i = 0; i < message.occurrences.length; ++i)
                    $root.scip.Occurrence.encode(message.occurrences[i], writer.uint32(/* id 2, wireType 2 =*/18).fork(), _depth + 1).ldelim();
            if (message.language != null && $Object.hasOwnProperty.call(message, "language") && message.language !== "")
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.language);
            if (message.text != null && $Object.hasOwnProperty.call(message, "text") && message.text !== "")
                writer.uint32(/* id 5, wireType 2 =*/42).string(message.text);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified Signature message, length delimited. Does not implicitly {@link scip.Signature.verify|verify} messages.
         * @function encodeDelimited
         * @memberof scip.Signature
         * @static
         * @param {scip.Signature.$Properties} message Signature message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Signature.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a Signature message from the specified reader or buffer.
         * @function decode
         * @memberof scip.Signature
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {scip.Signature & scip.Signature.$Shape} Signature
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Signature.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.scip.Signature(), value;
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 4: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.language = value;
                        else
                            delete message.language;
                        continue;
                    }
                case 5: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.text = value;
                        else
                            delete message.text;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if (!(message.occurrences && message.occurrences.length))
                            message.occurrences = [];
                        message.occurrences.push($root.scip.Occurrence.decode(reader, reader.uint32(), $undefined, _depth + 1));
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a Signature message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof scip.Signature
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {scip.Signature & scip.Signature.$Shape} Signature
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Signature.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Signature message.
         * @function verify
         * @memberof scip.Signature
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Signature.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.language != null && $Object.hasOwnProperty.call(message, "language"))
                if (!$util.isString(message.language))
                    return "language: string expected";
            if (message.text != null && $Object.hasOwnProperty.call(message, "text"))
                if (!$util.isString(message.text))
                    return "text: string expected";
            if (message.occurrences != null && $Object.hasOwnProperty.call(message, "occurrences")) {
                if (!$Array.isArray(message.occurrences))
                    return "occurrences: array expected";
                for (let i = 0; i < message.occurrences.length; ++i) {
                    let error = $root.scip.Occurrence.verify(message.occurrences[i], _depth + 1);
                    if (error)
                        return "occurrences." + error;
                }
            }
            return null;
        };

        /**
         * Creates a Signature message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof scip.Signature
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {scip.Signature} Signature
         */
        Signature.fromObject = function (object, _depth) {
            if (object instanceof $root.scip.Signature)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".scip.Signature: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.scip.Signature();
            if (object.language != null)
                if (typeof object.language !== "string" || object.language.length)
                    message.language = $String(object.language);
            if (object.text != null)
                if (typeof object.text !== "string" || object.text.length)
                    message.text = $String(object.text);
            if (object.occurrences) {
                if (!$Array.isArray(object.occurrences))
                    throw $TypeError(".scip.Signature.occurrences: array expected");
                message.occurrences = $Array(object.occurrences.length);
                for (let i = 0; i < object.occurrences.length; ++i) {
                    if (!$util.isObject(object.occurrences[i]))
                        throw $TypeError(".scip.Signature.occurrences: object expected");
                    message.occurrences[i] = $root.scip.Occurrence.fromObject(object.occurrences[i], _depth + 1);
                }
            }
            return message;
        };

        /**
         * Creates a plain object from a Signature message. Also converts values to other types if specified.
         * @function toObject
         * @memberof scip.Signature
         * @static
         * @param {scip.Signature} message Signature
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Signature.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.arrays || options.defaults)
                object.occurrences = [];
            if (options.defaults) {
                object.language = "";
                object.text = "";
            }
            if (message.occurrences && message.occurrences.length) {
                object.occurrences = $Array(message.occurrences.length);
                for (let j = 0; j < message.occurrences.length; ++j)
                    object.occurrences[j] = $root.scip.Occurrence.toObject(message.occurrences[j], options, _depth + 1);
            }
            if (message.language != null && $Object.hasOwnProperty.call(message, "language"))
                object.language = message.language;
            if (message.text != null && $Object.hasOwnProperty.call(message, "text"))
                object.text = message.text;
            return object;
        };

        /**
         * Converts this Signature to JSON.
         * @function toJSON
         * @memberof scip.Signature
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Signature.prototype.toJSON = function() {
            return Signature.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for Signature
         * @function getTypeUrl
         * @memberof scip.Signature
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        Signature.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/scip.Signature";
        };

        return Signature;
    })();

    scip.SymbolInformation = (function() {

        /**
         * Properties of a SymbolInformation.
         * @typedef {Object} scip.SymbolInformation.$Properties
         * @property {string|null} [symbol] SymbolInformation symbol
         * @property {Array.<string>|null} [documentation] SymbolInformation documentation
         * @property {Array.<scip.Relationship.$Properties>|null} [relationships] SymbolInformation relationships
         * @property {scip.SymbolInformation.Kind|null} [kind] SymbolInformation kind
         * @property {string|null} [displayName] SymbolInformation displayName
         * @property {scip.Signature.$Properties|null} [signatureDocumentation] SymbolInformation signatureDocumentation
         * @property {string|null} [enclosingSymbol] SymbolInformation enclosingSymbol
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a SymbolInformation.
         * @memberof scip
         * @interface ISymbolInformation
         * @augments scip.SymbolInformation.$Properties
         * @deprecated Use scip.SymbolInformation.$Properties instead.
         */

        /**
         * Shape of a SymbolInformation.
         * @typedef {{
         *   symbol?: string|null;
         *   documentation?: Array.<string>|null;
         *   relationships?: Array.<scip.Relationship.$Shape>|null;
         *   kind?: scip.SymbolInformation.Kind|null;
         *   displayName?: string|null;
         *   signatureDocumentation?: scip.Signature.$Shape|null;
         *   enclosingSymbol?: string|null;
         *   $unknowns?: Array.<Uint8Array>;
         * }} scip.SymbolInformation.$Shape
         */

        /**
         * Constructs a new SymbolInformation.
         * @memberof scip
         * @classdesc Represents a SymbolInformation.
         * @constructor
         * @param {scip.SymbolInformation.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const SymbolInformation = function (properties) {
            this.documentation = [];
            this.relationships = [];
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * SymbolInformation symbol.
         * @member {string} symbol
         * @memberof scip.SymbolInformation
         * @instance
         */
        SymbolInformation.prototype.symbol = "";

        /**
         * SymbolInformation documentation.
         * @member {Array.<string>} documentation
         * @memberof scip.SymbolInformation
         * @instance
         */
        SymbolInformation.prototype.documentation = $util.emptyArray;

        /**
         * SymbolInformation relationships.
         * @member {Array.<scip.Relationship.$Properties>} relationships
         * @memberof scip.SymbolInformation
         * @instance
         */
        SymbolInformation.prototype.relationships = $util.emptyArray;

        /**
         * SymbolInformation kind.
         * @member {scip.SymbolInformation.Kind} kind
         * @memberof scip.SymbolInformation
         * @instance
         */
        SymbolInformation.prototype.kind = 0;

        /**
         * SymbolInformation displayName.
         * @member {string} displayName
         * @memberof scip.SymbolInformation
         * @instance
         */
        SymbolInformation.prototype.displayName = "";

        /**
         * SymbolInformation signatureDocumentation.
         * @member {scip.Signature.$Properties|null|undefined} signatureDocumentation
         * @memberof scip.SymbolInformation
         * @instance
         */
        SymbolInformation.prototype.signatureDocumentation = null;

        /**
         * SymbolInformation enclosingSymbol.
         * @member {string} enclosingSymbol
         * @memberof scip.SymbolInformation
         * @instance
         */
        SymbolInformation.prototype.enclosingSymbol = "";

        /**
         * Creates a new SymbolInformation instance using the specified properties.
         * @function create
         * @memberof scip.SymbolInformation
         * @static
         * @param {scip.SymbolInformation.$Properties=} [properties] Properties to set
         * @returns {scip.SymbolInformation} SymbolInformation instance
         * @type {{
         *   (properties: scip.SymbolInformation.$Shape): scip.SymbolInformation & scip.SymbolInformation.$Shape;
         *   (properties?: scip.SymbolInformation.$Properties): scip.SymbolInformation;
         * }}
         */
        SymbolInformation.create = function(properties) {
            return new SymbolInformation(properties);
        };

        /**
         * Encodes the specified SymbolInformation message. Does not implicitly {@link scip.SymbolInformation.verify|verify} messages.
         * @function encode
         * @memberof scip.SymbolInformation
         * @static
         * @param {scip.SymbolInformation.$Properties} message SymbolInformation message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SymbolInformation.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.symbol != null && $Object.hasOwnProperty.call(message, "symbol") && message.symbol !== "")
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.symbol);
            if (message.documentation != null && message.documentation.length)
                for (let i = 0; i < message.documentation.length; ++i)
                    writer.uint32(/* id 3, wireType 2 =*/26).string(message.documentation[i]);
            if (message.relationships != null && message.relationships.length)
                for (let i = 0; i < message.relationships.length; ++i)
                    $root.scip.Relationship.encode(message.relationships[i], writer.uint32(/* id 4, wireType 2 =*/34).fork(), _depth + 1).ldelim();
            if (message.kind != null && $Object.hasOwnProperty.call(message, "kind") && message.kind !== 0)
                writer.uint32(/* id 5, wireType 0 =*/40).int32(message.kind);
            if (message.displayName != null && $Object.hasOwnProperty.call(message, "displayName") && message.displayName !== "")
                writer.uint32(/* id 6, wireType 2 =*/50).string(message.displayName);
            if (message.signatureDocumentation != null && $Object.hasOwnProperty.call(message, "signatureDocumentation"))
                $root.scip.Signature.encode(message.signatureDocumentation, writer.uint32(/* id 7, wireType 2 =*/58).fork(), _depth + 1).ldelim();
            if (message.enclosingSymbol != null && $Object.hasOwnProperty.call(message, "enclosingSymbol") && message.enclosingSymbol !== "")
                writer.uint32(/* id 8, wireType 2 =*/66).string(message.enclosingSymbol);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified SymbolInformation message, length delimited. Does not implicitly {@link scip.SymbolInformation.verify|verify} messages.
         * @function encodeDelimited
         * @memberof scip.SymbolInformation
         * @static
         * @param {scip.SymbolInformation.$Properties} message SymbolInformation message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SymbolInformation.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a SymbolInformation message from the specified reader or buffer.
         * @function decode
         * @memberof scip.SymbolInformation
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {scip.SymbolInformation & scip.SymbolInformation.$Shape} SymbolInformation
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SymbolInformation.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.scip.SymbolInformation(), value;
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.symbol = value;
                        else
                            delete message.symbol;
                        continue;
                    }
                case 3: {
                        if (wireType !== 2)
                            break;
                        if (!(message.documentation && message.documentation.length))
                            message.documentation = [];
                        message.documentation.push(reader.stringVerify());
                        continue;
                    }
                case 4: {
                        if (wireType !== 2)
                            break;
                        if (!(message.relationships && message.relationships.length))
                            message.relationships = [];
                        message.relationships.push($root.scip.Relationship.decode(reader, reader.uint32(), $undefined, _depth + 1));
                        continue;
                    }
                case 5: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.kind = value;
                        else
                            delete message.kind;
                        continue;
                    }
                case 6: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.displayName = value;
                        else
                            delete message.displayName;
                        continue;
                    }
                case 7: {
                        if (wireType !== 2)
                            break;
                        message.signatureDocumentation = $root.scip.Signature.decode(reader, reader.uint32(), $undefined, _depth + 1, message.signatureDocumentation);
                        continue;
                    }
                case 8: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.enclosingSymbol = value;
                        else
                            delete message.enclosingSymbol;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a SymbolInformation message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof scip.SymbolInformation
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {scip.SymbolInformation & scip.SymbolInformation.$Shape} SymbolInformation
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SymbolInformation.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a SymbolInformation message.
         * @function verify
         * @memberof scip.SymbolInformation
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        SymbolInformation.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.symbol != null && $Object.hasOwnProperty.call(message, "symbol"))
                if (!$util.isString(message.symbol))
                    return "symbol: string expected";
            if (message.documentation != null && $Object.hasOwnProperty.call(message, "documentation")) {
                if (!$Array.isArray(message.documentation))
                    return "documentation: array expected";
                for (let i = 0; i < message.documentation.length; ++i)
                    if (!$util.isString(message.documentation[i]))
                        return "documentation: string[] expected";
            }
            if (message.relationships != null && $Object.hasOwnProperty.call(message, "relationships")) {
                if (!$Array.isArray(message.relationships))
                    return "relationships: array expected";
                for (let i = 0; i < message.relationships.length; ++i) {
                    let error = $root.scip.Relationship.verify(message.relationships[i], _depth + 1);
                    if (error)
                        return "relationships." + error;
                }
            }
            if (message.kind != null && $Object.hasOwnProperty.call(message, "kind"))
                if (typeof message.kind !== "number" || (message.kind | 0) !== message.kind)
                    return "kind: enum value expected";
            if (message.displayName != null && $Object.hasOwnProperty.call(message, "displayName"))
                if (!$util.isString(message.displayName))
                    return "displayName: string expected";
            if (message.signatureDocumentation != null && $Object.hasOwnProperty.call(message, "signatureDocumentation")) {
                let error = $root.scip.Signature.verify(message.signatureDocumentation, _depth + 1);
                if (error)
                    return "signatureDocumentation." + error;
            }
            if (message.enclosingSymbol != null && $Object.hasOwnProperty.call(message, "enclosingSymbol"))
                if (!$util.isString(message.enclosingSymbol))
                    return "enclosingSymbol: string expected";
            return null;
        };

        /**
         * Creates a SymbolInformation message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof scip.SymbolInformation
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {scip.SymbolInformation} SymbolInformation
         */
        SymbolInformation.fromObject = function (object, _depth) {
            if (object instanceof $root.scip.SymbolInformation)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".scip.SymbolInformation: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.scip.SymbolInformation();
            if (object.symbol != null)
                if (typeof object.symbol !== "string" || object.symbol.length)
                    message.symbol = $String(object.symbol);
            if (object.documentation) {
                if (!$Array.isArray(object.documentation))
                    throw $TypeError(".scip.SymbolInformation.documentation: array expected");
                message.documentation = $Array(object.documentation.length);
                for (let i = 0; i < object.documentation.length; ++i)
                    message.documentation[i] = $String(object.documentation[i]);
            }
            if (object.relationships) {
                if (!$Array.isArray(object.relationships))
                    throw $TypeError(".scip.SymbolInformation.relationships: array expected");
                message.relationships = $Array(object.relationships.length);
                for (let i = 0; i < object.relationships.length; ++i) {
                    if (!$util.isObject(object.relationships[i]))
                        throw $TypeError(".scip.SymbolInformation.relationships: object expected");
                    message.relationships[i] = $root.scip.Relationship.fromObject(object.relationships[i], _depth + 1);
                }
            }
            if (object.kind !== 0 && (typeof object.kind !== "string" || $root.scip.SymbolInformation.Kind[object.kind] !== 0))
                switch (object.kind) {
                case "UnspecifiedKind":
                case 0:
                    message.kind = 0;
                    break;
                case "AbstractMethod":
                case 66:
                    message.kind = 66;
                    break;
                case "Accessor":
                case 72:
                    message.kind = 72;
                    break;
                case "Array":
                case 1:
                    message.kind = 1;
                    break;
                case "Assertion":
                case 2:
                    message.kind = 2;
                    break;
                case "AssociatedType":
                case 3:
                    message.kind = 3;
                    break;
                case "Attribute":
                case 4:
                    message.kind = 4;
                    break;
                case "Axiom":
                case 5:
                    message.kind = 5;
                    break;
                case "Boolean":
                case 6:
                    message.kind = 6;
                    break;
                case "Class":
                case 7:
                    message.kind = 7;
                    break;
                case "Concept":
                case 86:
                    message.kind = 86;
                    break;
                case "Constant":
                case 8:
                    message.kind = 8;
                    break;
                case "Constructor":
                case 9:
                    message.kind = 9;
                    break;
                case "Contract":
                case 62:
                    message.kind = 62;
                    break;
                case "DataFamily":
                case 10:
                    message.kind = 10;
                    break;
                case "Delegate":
                case 73:
                    message.kind = 73;
                    break;
                case "Enum":
                case 11:
                    message.kind = 11;
                    break;
                case "EnumMember":
                case 12:
                    message.kind = 12;
                    break;
                case "Error":
                case 63:
                    message.kind = 63;
                    break;
                case "Event":
                case 13:
                    message.kind = 13;
                    break;
                case "Extension":
                case 84:
                    message.kind = 84;
                    break;
                case "Fact":
                case 14:
                    message.kind = 14;
                    break;
                case "Field":
                case 15:
                    message.kind = 15;
                    break;
                case "File":
                case 16:
                    message.kind = 16;
                    break;
                case "Function":
                case 17:
                    message.kind = 17;
                    break;
                case "Getter":
                case 18:
                    message.kind = 18;
                    break;
                case "Grammar":
                case 19:
                    message.kind = 19;
                    break;
                case "Instance":
                case 20:
                    message.kind = 20;
                    break;
                case "Interface":
                case 21:
                    message.kind = 21;
                    break;
                case "Key":
                case 22:
                    message.kind = 22;
                    break;
                case "Lang":
                case 23:
                    message.kind = 23;
                    break;
                case "Lemma":
                case 24:
                    message.kind = 24;
                    break;
                case "Library":
                case 64:
                    message.kind = 64;
                    break;
                case "Macro":
                case 25:
                    message.kind = 25;
                    break;
                case "Method":
                case 26:
                    message.kind = 26;
                    break;
                case "MethodAlias":
                case 74:
                    message.kind = 74;
                    break;
                case "MethodReceiver":
                case 27:
                    message.kind = 27;
                    break;
                case "MethodSpecification":
                case 67:
                    message.kind = 67;
                    break;
                case "Message":
                case 28:
                    message.kind = 28;
                    break;
                case "Mixin":
                case 85:
                    message.kind = 85;
                    break;
                case "Modifier":
                case 65:
                    message.kind = 65;
                    break;
                case "Module":
                case 29:
                    message.kind = 29;
                    break;
                case "Namespace":
                case 30:
                    message.kind = 30;
                    break;
                case "Null":
                case 31:
                    message.kind = 31;
                    break;
                case "Number":
                case 32:
                    message.kind = 32;
                    break;
                case "Object":
                case 33:
                    message.kind = 33;
                    break;
                case "Operator":
                case 34:
                    message.kind = 34;
                    break;
                case "Package":
                case 35:
                    message.kind = 35;
                    break;
                case "PackageObject":
                case 36:
                    message.kind = 36;
                    break;
                case "Parameter":
                case 37:
                    message.kind = 37;
                    break;
                case "ParameterLabel":
                case 38:
                    message.kind = 38;
                    break;
                case "Pattern":
                case 39:
                    message.kind = 39;
                    break;
                case "Predicate":
                case 40:
                    message.kind = 40;
                    break;
                case "Property":
                case 41:
                    message.kind = 41;
                    break;
                case "Protocol":
                case 42:
                    message.kind = 42;
                    break;
                case "ProtocolMethod":
                case 68:
                    message.kind = 68;
                    break;
                case "PureVirtualMethod":
                case 69:
                    message.kind = 69;
                    break;
                case "Quasiquoter":
                case 43:
                    message.kind = 43;
                    break;
                case "SelfParameter":
                case 44:
                    message.kind = 44;
                    break;
                case "Setter":
                case 45:
                    message.kind = 45;
                    break;
                case "Signature":
                case 46:
                    message.kind = 46;
                    break;
                case "SingletonClass":
                case 75:
                    message.kind = 75;
                    break;
                case "SingletonMethod":
                case 76:
                    message.kind = 76;
                    break;
                case "StaticDataMember":
                case 77:
                    message.kind = 77;
                    break;
                case "StaticEvent":
                case 78:
                    message.kind = 78;
                    break;
                case "StaticField":
                case 79:
                    message.kind = 79;
                    break;
                case "StaticMethod":
                case 80:
                    message.kind = 80;
                    break;
                case "StaticProperty":
                case 81:
                    message.kind = 81;
                    break;
                case "StaticVariable":
                case 82:
                    message.kind = 82;
                    break;
                case "String":
                case 48:
                    message.kind = 48;
                    break;
                case "Struct":
                case 49:
                    message.kind = 49;
                    break;
                case "Subscript":
                case 47:
                    message.kind = 47;
                    break;
                case "Tactic":
                case 50:
                    message.kind = 50;
                    break;
                case "Theorem":
                case 51:
                    message.kind = 51;
                    break;
                case "ThisParameter":
                case 52:
                    message.kind = 52;
                    break;
                case "Trait":
                case 53:
                    message.kind = 53;
                    break;
                case "TraitMethod":
                case 70:
                    message.kind = 70;
                    break;
                case "Type":
                case 54:
                    message.kind = 54;
                    break;
                case "TypeAlias":
                case 55:
                    message.kind = 55;
                    break;
                case "TypeClass":
                case 56:
                    message.kind = 56;
                    break;
                case "TypeClassMethod":
                case 71:
                    message.kind = 71;
                    break;
                case "TypeFamily":
                case 57:
                    message.kind = 57;
                    break;
                case "TypeParameter":
                case 58:
                    message.kind = 58;
                    break;
                case "Union":
                case 59:
                    message.kind = 59;
                    break;
                case "Value":
                case 60:
                    message.kind = 60;
                    break;
                case "Variable":
                case 61:
                    message.kind = 61;
                    break;
                default:
                    if (typeof object.kind === "number" && (object.kind | 0) === object.kind)
                        message.kind = object.kind;
                }
            if (object.displayName != null)
                if (typeof object.displayName !== "string" || object.displayName.length)
                    message.displayName = $String(object.displayName);
            if (object.signatureDocumentation != null) {
                if (!$util.isObject(object.signatureDocumentation))
                    throw $TypeError(".scip.SymbolInformation.signatureDocumentation: object expected");
                message.signatureDocumentation = $root.scip.Signature.fromObject(object.signatureDocumentation, _depth + 1);
            }
            if (object.enclosingSymbol != null)
                if (typeof object.enclosingSymbol !== "string" || object.enclosingSymbol.length)
                    message.enclosingSymbol = $String(object.enclosingSymbol);
            return message;
        };

        /**
         * Creates a plain object from a SymbolInformation message. Also converts values to other types if specified.
         * @function toObject
         * @memberof scip.SymbolInformation
         * @static
         * @param {scip.SymbolInformation} message SymbolInformation
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        SymbolInformation.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.arrays || options.defaults) {
                object.documentation = [];
                object.relationships = [];
            }
            if (options.defaults) {
                object.symbol = "";
                object.kind = options.enums === $String ? "UnspecifiedKind" : 0;
                object.displayName = "";
                object.signatureDocumentation = null;
                object.enclosingSymbol = "";
            }
            if (message.symbol != null && $Object.hasOwnProperty.call(message, "symbol"))
                object.symbol = message.symbol;
            if (message.documentation && message.documentation.length) {
                object.documentation = $Array(message.documentation.length);
                for (let j = 0; j < message.documentation.length; ++j)
                    object.documentation[j] = message.documentation[j];
            }
            if (message.relationships && message.relationships.length) {
                object.relationships = $Array(message.relationships.length);
                for (let j = 0; j < message.relationships.length; ++j)
                    object.relationships[j] = $root.scip.Relationship.toObject(message.relationships[j], options, _depth + 1);
            }
            if (message.kind != null && $Object.hasOwnProperty.call(message, "kind"))
                object.kind = options.enums === $String ? $root.scip.SymbolInformation.Kind[message.kind] === $undefined ? message.kind : $root.scip.SymbolInformation.Kind[message.kind] : message.kind;
            if (message.displayName != null && $Object.hasOwnProperty.call(message, "displayName"))
                object.displayName = message.displayName;
            if (message.signatureDocumentation != null && $Object.hasOwnProperty.call(message, "signatureDocumentation"))
                object.signatureDocumentation = $root.scip.Signature.toObject(message.signatureDocumentation, options, _depth + 1);
            if (message.enclosingSymbol != null && $Object.hasOwnProperty.call(message, "enclosingSymbol"))
                object.enclosingSymbol = message.enclosingSymbol;
            return object;
        };

        /**
         * Converts this SymbolInformation to JSON.
         * @function toJSON
         * @memberof scip.SymbolInformation
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        SymbolInformation.prototype.toJSON = function() {
            return SymbolInformation.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for SymbolInformation
         * @function getTypeUrl
         * @memberof scip.SymbolInformation
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        SymbolInformation.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/scip.SymbolInformation";
        };

        /**
         * Kind enum.
         * @name scip.SymbolInformation.Kind
         * @enum {number}
         * @property {number} UnspecifiedKind=0 UnspecifiedKind value
         * @property {number} AbstractMethod=66 AbstractMethod value
         * @property {number} Accessor=72 Accessor value
         * @property {number} Array=1 Array value
         * @property {number} Assertion=2 Assertion value
         * @property {number} AssociatedType=3 AssociatedType value
         * @property {number} Attribute=4 Attribute value
         * @property {number} Axiom=5 Axiom value
         * @property {number} Boolean=6 Boolean value
         * @property {number} Class=7 Class value
         * @property {number} Concept=86 Concept value
         * @property {number} Constant=8 Constant value
         * @property {number} Constructor=9 Constructor value
         * @property {number} Contract=62 Contract value
         * @property {number} DataFamily=10 DataFamily value
         * @property {number} Delegate=73 Delegate value
         * @property {number} Enum=11 Enum value
         * @property {number} EnumMember=12 EnumMember value
         * @property {number} Error=63 Error value
         * @property {number} Event=13 Event value
         * @property {number} Extension=84 Extension value
         * @property {number} Fact=14 Fact value
         * @property {number} Field=15 Field value
         * @property {number} File=16 File value
         * @property {number} Function=17 Function value
         * @property {number} Getter=18 Getter value
         * @property {number} Grammar=19 Grammar value
         * @property {number} Instance=20 Instance value
         * @property {number} Interface=21 Interface value
         * @property {number} Key=22 Key value
         * @property {number} Lang=23 Lang value
         * @property {number} Lemma=24 Lemma value
         * @property {number} Library=64 Library value
         * @property {number} Macro=25 Macro value
         * @property {number} Method=26 Method value
         * @property {number} MethodAlias=74 MethodAlias value
         * @property {number} MethodReceiver=27 MethodReceiver value
         * @property {number} MethodSpecification=67 MethodSpecification value
         * @property {number} Message=28 Message value
         * @property {number} Mixin=85 Mixin value
         * @property {number} Modifier=65 Modifier value
         * @property {number} Module=29 Module value
         * @property {number} Namespace=30 Namespace value
         * @property {number} Null=31 Null value
         * @property {number} Number=32 Number value
         * @property {number} Object=33 Object value
         * @property {number} Operator=34 Operator value
         * @property {number} Package=35 Package value
         * @property {number} PackageObject=36 PackageObject value
         * @property {number} Parameter=37 Parameter value
         * @property {number} ParameterLabel=38 ParameterLabel value
         * @property {number} Pattern=39 Pattern value
         * @property {number} Predicate=40 Predicate value
         * @property {number} Property=41 Property value
         * @property {number} Protocol=42 Protocol value
         * @property {number} ProtocolMethod=68 ProtocolMethod value
         * @property {number} PureVirtualMethod=69 PureVirtualMethod value
         * @property {number} Quasiquoter=43 Quasiquoter value
         * @property {number} SelfParameter=44 SelfParameter value
         * @property {number} Setter=45 Setter value
         * @property {number} Signature=46 Signature value
         * @property {number} SingletonClass=75 SingletonClass value
         * @property {number} SingletonMethod=76 SingletonMethod value
         * @property {number} StaticDataMember=77 StaticDataMember value
         * @property {number} StaticEvent=78 StaticEvent value
         * @property {number} StaticField=79 StaticField value
         * @property {number} StaticMethod=80 StaticMethod value
         * @property {number} StaticProperty=81 StaticProperty value
         * @property {number} StaticVariable=82 StaticVariable value
         * @property {number} String=48 String value
         * @property {number} Struct=49 Struct value
         * @property {number} Subscript=47 Subscript value
         * @property {number} Tactic=50 Tactic value
         * @property {number} Theorem=51 Theorem value
         * @property {number} ThisParameter=52 ThisParameter value
         * @property {number} Trait=53 Trait value
         * @property {number} TraitMethod=70 TraitMethod value
         * @property {number} Type=54 Type value
         * @property {number} TypeAlias=55 TypeAlias value
         * @property {number} TypeClass=56 TypeClass value
         * @property {number} TypeClassMethod=71 TypeClassMethod value
         * @property {number} TypeFamily=57 TypeFamily value
         * @property {number} TypeParameter=58 TypeParameter value
         * @property {number} Union=59 Union value
         * @property {number} Value=60 Value value
         * @property {number} Variable=61 Variable value
         */
        SymbolInformation.Kind = (function() {
            const valuesById = $Object.create(null), values = $Object.create(valuesById);
            values[valuesById[0] = "UnspecifiedKind"] = 0;
            values[valuesById[66] = "AbstractMethod"] = 66;
            values[valuesById[72] = "Accessor"] = 72;
            values[valuesById[1] = "Array"] = 1;
            values[valuesById[2] = "Assertion"] = 2;
            values[valuesById[3] = "AssociatedType"] = 3;
            values[valuesById[4] = "Attribute"] = 4;
            values[valuesById[5] = "Axiom"] = 5;
            values[valuesById[6] = "Boolean"] = 6;
            values[valuesById[7] = "Class"] = 7;
            values[valuesById[86] = "Concept"] = 86;
            values[valuesById[8] = "Constant"] = 8;
            values[valuesById[9] = "Constructor"] = 9;
            values[valuesById[62] = "Contract"] = 62;
            values[valuesById[10] = "DataFamily"] = 10;
            values[valuesById[73] = "Delegate"] = 73;
            values[valuesById[11] = "Enum"] = 11;
            values[valuesById[12] = "EnumMember"] = 12;
            values[valuesById[63] = "Error"] = 63;
            values[valuesById[13] = "Event"] = 13;
            values[valuesById[84] = "Extension"] = 84;
            values[valuesById[14] = "Fact"] = 14;
            values[valuesById[15] = "Field"] = 15;
            values[valuesById[16] = "File"] = 16;
            values[valuesById[17] = "Function"] = 17;
            values[valuesById[18] = "Getter"] = 18;
            values[valuesById[19] = "Grammar"] = 19;
            values[valuesById[20] = "Instance"] = 20;
            values[valuesById[21] = "Interface"] = 21;
            values[valuesById[22] = "Key"] = 22;
            values[valuesById[23] = "Lang"] = 23;
            values[valuesById[24] = "Lemma"] = 24;
            values[valuesById[64] = "Library"] = 64;
            values[valuesById[25] = "Macro"] = 25;
            values[valuesById[26] = "Method"] = 26;
            values[valuesById[74] = "MethodAlias"] = 74;
            values[valuesById[27] = "MethodReceiver"] = 27;
            values[valuesById[67] = "MethodSpecification"] = 67;
            values[valuesById[28] = "Message"] = 28;
            values[valuesById[85] = "Mixin"] = 85;
            values[valuesById[65] = "Modifier"] = 65;
            values[valuesById[29] = "Module"] = 29;
            values[valuesById[30] = "Namespace"] = 30;
            values[valuesById[31] = "Null"] = 31;
            values[valuesById[32] = "Number"] = 32;
            values[valuesById[33] = "Object"] = 33;
            values[valuesById[34] = "Operator"] = 34;
            values[valuesById[35] = "Package"] = 35;
            values[valuesById[36] = "PackageObject"] = 36;
            values[valuesById[37] = "Parameter"] = 37;
            values[valuesById[38] = "ParameterLabel"] = 38;
            values[valuesById[39] = "Pattern"] = 39;
            values[valuesById[40] = "Predicate"] = 40;
            values[valuesById[41] = "Property"] = 41;
            values[valuesById[42] = "Protocol"] = 42;
            values[valuesById[68] = "ProtocolMethod"] = 68;
            values[valuesById[69] = "PureVirtualMethod"] = 69;
            values[valuesById[43] = "Quasiquoter"] = 43;
            values[valuesById[44] = "SelfParameter"] = 44;
            values[valuesById[45] = "Setter"] = 45;
            values[valuesById[46] = "Signature"] = 46;
            values[valuesById[75] = "SingletonClass"] = 75;
            values[valuesById[76] = "SingletonMethod"] = 76;
            values[valuesById[77] = "StaticDataMember"] = 77;
            values[valuesById[78] = "StaticEvent"] = 78;
            values[valuesById[79] = "StaticField"] = 79;
            values[valuesById[80] = "StaticMethod"] = 80;
            values[valuesById[81] = "StaticProperty"] = 81;
            values[valuesById[82] = "StaticVariable"] = 82;
            values[valuesById[48] = "String"] = 48;
            values[valuesById[49] = "Struct"] = 49;
            values[valuesById[47] = "Subscript"] = 47;
            values[valuesById[50] = "Tactic"] = 50;
            values[valuesById[51] = "Theorem"] = 51;
            values[valuesById[52] = "ThisParameter"] = 52;
            values[valuesById[53] = "Trait"] = 53;
            values[valuesById[70] = "TraitMethod"] = 70;
            values[valuesById[54] = "Type"] = 54;
            values[valuesById[55] = "TypeAlias"] = 55;
            values[valuesById[56] = "TypeClass"] = 56;
            values[valuesById[71] = "TypeClassMethod"] = 71;
            values[valuesById[57] = "TypeFamily"] = 57;
            values[valuesById[58] = "TypeParameter"] = 58;
            values[valuesById[59] = "Union"] = 59;
            values[valuesById[60] = "Value"] = 60;
            values[valuesById[61] = "Variable"] = 61;
            return values;
        })();

        return SymbolInformation;
    })();

    scip.Relationship = (function() {

        /**
         * Properties of a Relationship.
         * @typedef {Object} scip.Relationship.$Properties
         * @property {string|null} [symbol] Relationship symbol
         * @property {boolean|null} [isReference] Relationship isReference
         * @property {boolean|null} [isImplementation] Relationship isImplementation
         * @property {boolean|null} [isTypeDefinition] Relationship isTypeDefinition
         * @property {boolean|null} [isDefinition] Relationship isDefinition
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a Relationship.
         * @memberof scip
         * @interface IRelationship
         * @augments scip.Relationship.$Properties
         * @deprecated Use scip.Relationship.$Properties instead.
         */

        /**
         * Shape of a Relationship.
         * @typedef {scip.Relationship.$Properties} scip.Relationship.$Shape
         */

        /**
         * Constructs a new Relationship.
         * @memberof scip
         * @classdesc Represents a Relationship.
         * @constructor
         * @param {scip.Relationship.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const Relationship = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * Relationship symbol.
         * @member {string} symbol
         * @memberof scip.Relationship
         * @instance
         */
        Relationship.prototype.symbol = "";

        /**
         * Relationship isReference.
         * @member {boolean} isReference
         * @memberof scip.Relationship
         * @instance
         */
        Relationship.prototype.isReference = false;

        /**
         * Relationship isImplementation.
         * @member {boolean} isImplementation
         * @memberof scip.Relationship
         * @instance
         */
        Relationship.prototype.isImplementation = false;

        /**
         * Relationship isTypeDefinition.
         * @member {boolean} isTypeDefinition
         * @memberof scip.Relationship
         * @instance
         */
        Relationship.prototype.isTypeDefinition = false;

        /**
         * Relationship isDefinition.
         * @member {boolean} isDefinition
         * @memberof scip.Relationship
         * @instance
         */
        Relationship.prototype.isDefinition = false;

        /**
         * Creates a new Relationship instance using the specified properties.
         * @function create
         * @memberof scip.Relationship
         * @static
         * @param {scip.Relationship.$Properties=} [properties] Properties to set
         * @returns {scip.Relationship} Relationship instance
         * @type {{
         *   (properties: scip.Relationship.$Shape): scip.Relationship & scip.Relationship.$Shape;
         *   (properties?: scip.Relationship.$Properties): scip.Relationship;
         * }}
         */
        Relationship.create = function(properties) {
            return new Relationship(properties);
        };

        /**
         * Encodes the specified Relationship message. Does not implicitly {@link scip.Relationship.verify|verify} messages.
         * @function encode
         * @memberof scip.Relationship
         * @static
         * @param {scip.Relationship.$Properties} message Relationship message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Relationship.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.symbol != null && $Object.hasOwnProperty.call(message, "symbol") && message.symbol !== "")
                writer.uint32(/* id 1, wireType 2 =*/10).string(message.symbol);
            if (message.isReference != null && $Object.hasOwnProperty.call(message, "isReference") && message.isReference !== false)
                writer.uint32(/* id 2, wireType 0 =*/16).bool(message.isReference);
            if (message.isImplementation != null && $Object.hasOwnProperty.call(message, "isImplementation") && message.isImplementation !== false)
                writer.uint32(/* id 3, wireType 0 =*/24).bool(message.isImplementation);
            if (message.isTypeDefinition != null && $Object.hasOwnProperty.call(message, "isTypeDefinition") && message.isTypeDefinition !== false)
                writer.uint32(/* id 4, wireType 0 =*/32).bool(message.isTypeDefinition);
            if (message.isDefinition != null && $Object.hasOwnProperty.call(message, "isDefinition") && message.isDefinition !== false)
                writer.uint32(/* id 5, wireType 0 =*/40).bool(message.isDefinition);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified Relationship message, length delimited. Does not implicitly {@link scip.Relationship.verify|verify} messages.
         * @function encodeDelimited
         * @memberof scip.Relationship
         * @static
         * @param {scip.Relationship.$Properties} message Relationship message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Relationship.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a Relationship message from the specified reader or buffer.
         * @function decode
         * @memberof scip.Relationship
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {scip.Relationship & scip.Relationship.$Shape} Relationship
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Relationship.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.scip.Relationship(), value;
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.symbol = value;
                        else
                            delete message.symbol;
                        continue;
                    }
                case 2: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.bool())
                            message.isReference = value;
                        else
                            delete message.isReference;
                        continue;
                    }
                case 3: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.bool())
                            message.isImplementation = value;
                        else
                            delete message.isImplementation;
                        continue;
                    }
                case 4: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.bool())
                            message.isTypeDefinition = value;
                        else
                            delete message.isTypeDefinition;
                        continue;
                    }
                case 5: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.bool())
                            message.isDefinition = value;
                        else
                            delete message.isDefinition;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a Relationship message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof scip.Relationship
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {scip.Relationship & scip.Relationship.$Shape} Relationship
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Relationship.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Relationship message.
         * @function verify
         * @memberof scip.Relationship
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Relationship.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.symbol != null && $Object.hasOwnProperty.call(message, "symbol"))
                if (!$util.isString(message.symbol))
                    return "symbol: string expected";
            if (message.isReference != null && $Object.hasOwnProperty.call(message, "isReference"))
                if (typeof message.isReference !== "boolean")
                    return "isReference: boolean expected";
            if (message.isImplementation != null && $Object.hasOwnProperty.call(message, "isImplementation"))
                if (typeof message.isImplementation !== "boolean")
                    return "isImplementation: boolean expected";
            if (message.isTypeDefinition != null && $Object.hasOwnProperty.call(message, "isTypeDefinition"))
                if (typeof message.isTypeDefinition !== "boolean")
                    return "isTypeDefinition: boolean expected";
            if (message.isDefinition != null && $Object.hasOwnProperty.call(message, "isDefinition"))
                if (typeof message.isDefinition !== "boolean")
                    return "isDefinition: boolean expected";
            return null;
        };

        /**
         * Creates a Relationship message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof scip.Relationship
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {scip.Relationship} Relationship
         */
        Relationship.fromObject = function (object, _depth) {
            if (object instanceof $root.scip.Relationship)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".scip.Relationship: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.scip.Relationship();
            if (object.symbol != null)
                if (typeof object.symbol !== "string" || object.symbol.length)
                    message.symbol = $String(object.symbol);
            if (object.isReference != null)
                if (object.isReference)
                    message.isReference = $Boolean(object.isReference);
            if (object.isImplementation != null)
                if (object.isImplementation)
                    message.isImplementation = $Boolean(object.isImplementation);
            if (object.isTypeDefinition != null)
                if (object.isTypeDefinition)
                    message.isTypeDefinition = $Boolean(object.isTypeDefinition);
            if (object.isDefinition != null)
                if (object.isDefinition)
                    message.isDefinition = $Boolean(object.isDefinition);
            return message;
        };

        /**
         * Creates a plain object from a Relationship message. Also converts values to other types if specified.
         * @function toObject
         * @memberof scip.Relationship
         * @static
         * @param {scip.Relationship} message Relationship
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Relationship.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                object.symbol = "";
                object.isReference = false;
                object.isImplementation = false;
                object.isTypeDefinition = false;
                object.isDefinition = false;
            }
            if (message.symbol != null && $Object.hasOwnProperty.call(message, "symbol"))
                object.symbol = message.symbol;
            if (message.isReference != null && $Object.hasOwnProperty.call(message, "isReference"))
                object.isReference = message.isReference;
            if (message.isImplementation != null && $Object.hasOwnProperty.call(message, "isImplementation"))
                object.isImplementation = message.isImplementation;
            if (message.isTypeDefinition != null && $Object.hasOwnProperty.call(message, "isTypeDefinition"))
                object.isTypeDefinition = message.isTypeDefinition;
            if (message.isDefinition != null && $Object.hasOwnProperty.call(message, "isDefinition"))
                object.isDefinition = message.isDefinition;
            return object;
        };

        /**
         * Converts this Relationship to JSON.
         * @function toJSON
         * @memberof scip.Relationship
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Relationship.prototype.toJSON = function() {
            return Relationship.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for Relationship
         * @function getTypeUrl
         * @memberof scip.Relationship
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        Relationship.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/scip.Relationship";
        };

        return Relationship;
    })();

    /**
     * SymbolRole enum.
     * @name scip.SymbolRole
     * @enum {number}
     * @property {number} UnspecifiedSymbolRole=0 UnspecifiedSymbolRole value
     * @property {number} Definition=1 Definition value
     * @property {number} Import=2 Import value
     * @property {number} WriteAccess=4 WriteAccess value
     * @property {number} ReadAccess=8 ReadAccess value
     * @property {number} Generated=16 Generated value
     * @property {number} Test=32 Test value
     * @property {number} ForwardDefinition=64 ForwardDefinition value
     */
    scip.SymbolRole = (function() {
        const valuesById = $Object.create(null), values = $Object.create(valuesById);
        values[valuesById[0] = "UnspecifiedSymbolRole"] = 0;
        values[valuesById[1] = "Definition"] = 1;
        values[valuesById[2] = "Import"] = 2;
        values[valuesById[4] = "WriteAccess"] = 4;
        values[valuesById[8] = "ReadAccess"] = 8;
        values[valuesById[16] = "Generated"] = 16;
        values[valuesById[32] = "Test"] = 32;
        values[valuesById[64] = "ForwardDefinition"] = 64;
        return values;
    })();

    /**
     * SyntaxKind enum.
     * @name scip.SyntaxKind
     * @enum {number}
     * @property {number} UnspecifiedSyntaxKind=0 UnspecifiedSyntaxKind value
     * @property {number} Comment=1 Comment value
     * @property {number} PunctuationDelimiter=2 PunctuationDelimiter value
     * @property {number} PunctuationBracket=3 PunctuationBracket value
     * @property {number} Keyword=4 Keyword value
     * @property {number} IdentifierKeyword=4 IdentifierKeyword value
     * @property {number} IdentifierOperator=5 IdentifierOperator value
     * @property {number} Identifier=6 Identifier value
     * @property {number} IdentifierBuiltin=7 IdentifierBuiltin value
     * @property {number} IdentifierNull=8 IdentifierNull value
     * @property {number} IdentifierConstant=9 IdentifierConstant value
     * @property {number} IdentifierMutableGlobal=10 IdentifierMutableGlobal value
     * @property {number} IdentifierParameter=11 IdentifierParameter value
     * @property {number} IdentifierLocal=12 IdentifierLocal value
     * @property {number} IdentifierShadowed=13 IdentifierShadowed value
     * @property {number} IdentifierNamespace=14 IdentifierNamespace value
     * @property {number} IdentifierModule=14 IdentifierModule value
     * @property {number} IdentifierFunction=15 IdentifierFunction value
     * @property {number} IdentifierFunctionDefinition=16 IdentifierFunctionDefinition value
     * @property {number} IdentifierMacro=17 IdentifierMacro value
     * @property {number} IdentifierMacroDefinition=18 IdentifierMacroDefinition value
     * @property {number} IdentifierType=19 IdentifierType value
     * @property {number} IdentifierBuiltinType=20 IdentifierBuiltinType value
     * @property {number} IdentifierAttribute=21 IdentifierAttribute value
     * @property {number} RegexEscape=22 RegexEscape value
     * @property {number} RegexRepeated=23 RegexRepeated value
     * @property {number} RegexWildcard=24 RegexWildcard value
     * @property {number} RegexDelimiter=25 RegexDelimiter value
     * @property {number} RegexJoin=26 RegexJoin value
     * @property {number} StringLiteral=27 StringLiteral value
     * @property {number} StringLiteralEscape=28 StringLiteralEscape value
     * @property {number} StringLiteralSpecial=29 StringLiteralSpecial value
     * @property {number} StringLiteralKey=30 StringLiteralKey value
     * @property {number} CharacterLiteral=31 CharacterLiteral value
     * @property {number} NumericLiteral=32 NumericLiteral value
     * @property {number} BooleanLiteral=33 BooleanLiteral value
     * @property {number} Tag=34 Tag value
     * @property {number} TagAttribute=35 TagAttribute value
     * @property {number} TagDelimiter=36 TagDelimiter value
     */
    scip.SyntaxKind = (function() {
        const valuesById = $Object.create(null), values = $Object.create(valuesById);
        values[valuesById[0] = "UnspecifiedSyntaxKind"] = 0;
        values[valuesById[1] = "Comment"] = 1;
        values[valuesById[2] = "PunctuationDelimiter"] = 2;
        values[valuesById[3] = "PunctuationBracket"] = 3;
        values[valuesById[4] = "Keyword"] = 4;
        values["IdentifierKeyword"] = 4;
        values[valuesById[5] = "IdentifierOperator"] = 5;
        values[valuesById[6] = "Identifier"] = 6;
        values[valuesById[7] = "IdentifierBuiltin"] = 7;
        values[valuesById[8] = "IdentifierNull"] = 8;
        values[valuesById[9] = "IdentifierConstant"] = 9;
        values[valuesById[10] = "IdentifierMutableGlobal"] = 10;
        values[valuesById[11] = "IdentifierParameter"] = 11;
        values[valuesById[12] = "IdentifierLocal"] = 12;
        values[valuesById[13] = "IdentifierShadowed"] = 13;
        values[valuesById[14] = "IdentifierNamespace"] = 14;
        values["IdentifierModule"] = 14;
        values[valuesById[15] = "IdentifierFunction"] = 15;
        values[valuesById[16] = "IdentifierFunctionDefinition"] = 16;
        values[valuesById[17] = "IdentifierMacro"] = 17;
        values[valuesById[18] = "IdentifierMacroDefinition"] = 18;
        values[valuesById[19] = "IdentifierType"] = 19;
        values[valuesById[20] = "IdentifierBuiltinType"] = 20;
        values[valuesById[21] = "IdentifierAttribute"] = 21;
        values[valuesById[22] = "RegexEscape"] = 22;
        values[valuesById[23] = "RegexRepeated"] = 23;
        values[valuesById[24] = "RegexWildcard"] = 24;
        values[valuesById[25] = "RegexDelimiter"] = 25;
        values[valuesById[26] = "RegexJoin"] = 26;
        values[valuesById[27] = "StringLiteral"] = 27;
        values[valuesById[28] = "StringLiteralEscape"] = 28;
        values[valuesById[29] = "StringLiteralSpecial"] = 29;
        values[valuesById[30] = "StringLiteralKey"] = 30;
        values[valuesById[31] = "CharacterLiteral"] = 31;
        values[valuesById[32] = "NumericLiteral"] = 32;
        values[valuesById[33] = "BooleanLiteral"] = 33;
        values[valuesById[34] = "Tag"] = 34;
        values[valuesById[35] = "TagAttribute"] = 35;
        values[valuesById[36] = "TagDelimiter"] = 36;
        return values;
    })();

    scip.SingleLineRange = (function() {

        /**
         * Properties of a SingleLineRange.
         * @typedef {Object} scip.SingleLineRange.$Properties
         * @property {number|null} [line] SingleLineRange line
         * @property {number|null} [startCharacter] SingleLineRange startCharacter
         * @property {number|null} [endCharacter] SingleLineRange endCharacter
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a SingleLineRange.
         * @memberof scip
         * @interface ISingleLineRange
         * @augments scip.SingleLineRange.$Properties
         * @deprecated Use scip.SingleLineRange.$Properties instead.
         */

        /**
         * Shape of a SingleLineRange.
         * @typedef {scip.SingleLineRange.$Properties} scip.SingleLineRange.$Shape
         */

        /**
         * Constructs a new SingleLineRange.
         * @memberof scip
         * @classdesc Represents a SingleLineRange.
         * @constructor
         * @param {scip.SingleLineRange.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const SingleLineRange = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * SingleLineRange line.
         * @member {number} line
         * @memberof scip.SingleLineRange
         * @instance
         */
        SingleLineRange.prototype.line = 0;

        /**
         * SingleLineRange startCharacter.
         * @member {number} startCharacter
         * @memberof scip.SingleLineRange
         * @instance
         */
        SingleLineRange.prototype.startCharacter = 0;

        /**
         * SingleLineRange endCharacter.
         * @member {number} endCharacter
         * @memberof scip.SingleLineRange
         * @instance
         */
        SingleLineRange.prototype.endCharacter = 0;

        /**
         * Creates a new SingleLineRange instance using the specified properties.
         * @function create
         * @memberof scip.SingleLineRange
         * @static
         * @param {scip.SingleLineRange.$Properties=} [properties] Properties to set
         * @returns {scip.SingleLineRange} SingleLineRange instance
         * @type {{
         *   (properties: scip.SingleLineRange.$Shape): scip.SingleLineRange & scip.SingleLineRange.$Shape;
         *   (properties?: scip.SingleLineRange.$Properties): scip.SingleLineRange;
         * }}
         */
        SingleLineRange.create = function(properties) {
            return new SingleLineRange(properties);
        };

        /**
         * Encodes the specified SingleLineRange message. Does not implicitly {@link scip.SingleLineRange.verify|verify} messages.
         * @function encode
         * @memberof scip.SingleLineRange
         * @static
         * @param {scip.SingleLineRange.$Properties} message SingleLineRange message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SingleLineRange.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.line != null && $Object.hasOwnProperty.call(message, "line") && message.line !== 0)
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.line);
            if (message.startCharacter != null && $Object.hasOwnProperty.call(message, "startCharacter") && message.startCharacter !== 0)
                writer.uint32(/* id 2, wireType 0 =*/16).int32(message.startCharacter);
            if (message.endCharacter != null && $Object.hasOwnProperty.call(message, "endCharacter") && message.endCharacter !== 0)
                writer.uint32(/* id 3, wireType 0 =*/24).int32(message.endCharacter);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified SingleLineRange message, length delimited. Does not implicitly {@link scip.SingleLineRange.verify|verify} messages.
         * @function encodeDelimited
         * @memberof scip.SingleLineRange
         * @static
         * @param {scip.SingleLineRange.$Properties} message SingleLineRange message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        SingleLineRange.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a SingleLineRange message from the specified reader or buffer.
         * @function decode
         * @memberof scip.SingleLineRange
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {scip.SingleLineRange & scip.SingleLineRange.$Shape} SingleLineRange
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SingleLineRange.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.scip.SingleLineRange(), value;
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.line = value;
                        else
                            delete message.line;
                        continue;
                    }
                case 2: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.startCharacter = value;
                        else
                            delete message.startCharacter;
                        continue;
                    }
                case 3: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.endCharacter = value;
                        else
                            delete message.endCharacter;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a SingleLineRange message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof scip.SingleLineRange
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {scip.SingleLineRange & scip.SingleLineRange.$Shape} SingleLineRange
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        SingleLineRange.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a SingleLineRange message.
         * @function verify
         * @memberof scip.SingleLineRange
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        SingleLineRange.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.line != null && $Object.hasOwnProperty.call(message, "line"))
                if (!$util.isInteger(message.line))
                    return "line: integer expected";
            if (message.startCharacter != null && $Object.hasOwnProperty.call(message, "startCharacter"))
                if (!$util.isInteger(message.startCharacter))
                    return "startCharacter: integer expected";
            if (message.endCharacter != null && $Object.hasOwnProperty.call(message, "endCharacter"))
                if (!$util.isInteger(message.endCharacter))
                    return "endCharacter: integer expected";
            return null;
        };

        /**
         * Creates a SingleLineRange message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof scip.SingleLineRange
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {scip.SingleLineRange} SingleLineRange
         */
        SingleLineRange.fromObject = function (object, _depth) {
            if (object instanceof $root.scip.SingleLineRange)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".scip.SingleLineRange: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.scip.SingleLineRange();
            if (object.line != null)
                if ($Number(object.line) !== 0)
                    message.line = object.line | 0;
            if (object.startCharacter != null)
                if ($Number(object.startCharacter) !== 0)
                    message.startCharacter = object.startCharacter | 0;
            if (object.endCharacter != null)
                if ($Number(object.endCharacter) !== 0)
                    message.endCharacter = object.endCharacter | 0;
            return message;
        };

        /**
         * Creates a plain object from a SingleLineRange message. Also converts values to other types if specified.
         * @function toObject
         * @memberof scip.SingleLineRange
         * @static
         * @param {scip.SingleLineRange} message SingleLineRange
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        SingleLineRange.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                object.line = 0;
                object.startCharacter = 0;
                object.endCharacter = 0;
            }
            if (message.line != null && $Object.hasOwnProperty.call(message, "line"))
                object.line = message.line;
            if (message.startCharacter != null && $Object.hasOwnProperty.call(message, "startCharacter"))
                object.startCharacter = message.startCharacter;
            if (message.endCharacter != null && $Object.hasOwnProperty.call(message, "endCharacter"))
                object.endCharacter = message.endCharacter;
            return object;
        };

        /**
         * Converts this SingleLineRange to JSON.
         * @function toJSON
         * @memberof scip.SingleLineRange
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        SingleLineRange.prototype.toJSON = function() {
            return SingleLineRange.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for SingleLineRange
         * @function getTypeUrl
         * @memberof scip.SingleLineRange
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        SingleLineRange.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/scip.SingleLineRange";
        };

        return SingleLineRange;
    })();

    scip.MultiLineRange = (function() {

        /**
         * Properties of a MultiLineRange.
         * @typedef {Object} scip.MultiLineRange.$Properties
         * @property {number|null} [startLine] MultiLineRange startLine
         * @property {number|null} [startCharacter] MultiLineRange startCharacter
         * @property {number|null} [endLine] MultiLineRange endLine
         * @property {number|null} [endCharacter] MultiLineRange endCharacter
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a MultiLineRange.
         * @memberof scip
         * @interface IMultiLineRange
         * @augments scip.MultiLineRange.$Properties
         * @deprecated Use scip.MultiLineRange.$Properties instead.
         */

        /**
         * Shape of a MultiLineRange.
         * @typedef {scip.MultiLineRange.$Properties} scip.MultiLineRange.$Shape
         */

        /**
         * Constructs a new MultiLineRange.
         * @memberof scip
         * @classdesc Represents a MultiLineRange.
         * @constructor
         * @param {scip.MultiLineRange.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const MultiLineRange = function (properties) {
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * MultiLineRange startLine.
         * @member {number} startLine
         * @memberof scip.MultiLineRange
         * @instance
         */
        MultiLineRange.prototype.startLine = 0;

        /**
         * MultiLineRange startCharacter.
         * @member {number} startCharacter
         * @memberof scip.MultiLineRange
         * @instance
         */
        MultiLineRange.prototype.startCharacter = 0;

        /**
         * MultiLineRange endLine.
         * @member {number} endLine
         * @memberof scip.MultiLineRange
         * @instance
         */
        MultiLineRange.prototype.endLine = 0;

        /**
         * MultiLineRange endCharacter.
         * @member {number} endCharacter
         * @memberof scip.MultiLineRange
         * @instance
         */
        MultiLineRange.prototype.endCharacter = 0;

        /**
         * Creates a new MultiLineRange instance using the specified properties.
         * @function create
         * @memberof scip.MultiLineRange
         * @static
         * @param {scip.MultiLineRange.$Properties=} [properties] Properties to set
         * @returns {scip.MultiLineRange} MultiLineRange instance
         * @type {{
         *   (properties: scip.MultiLineRange.$Shape): scip.MultiLineRange & scip.MultiLineRange.$Shape;
         *   (properties?: scip.MultiLineRange.$Properties): scip.MultiLineRange;
         * }}
         */
        MultiLineRange.create = function(properties) {
            return new MultiLineRange(properties);
        };

        /**
         * Encodes the specified MultiLineRange message. Does not implicitly {@link scip.MultiLineRange.verify|verify} messages.
         * @function encode
         * @memberof scip.MultiLineRange
         * @static
         * @param {scip.MultiLineRange.$Properties} message MultiLineRange message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        MultiLineRange.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.startLine != null && $Object.hasOwnProperty.call(message, "startLine") && message.startLine !== 0)
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.startLine);
            if (message.startCharacter != null && $Object.hasOwnProperty.call(message, "startCharacter") && message.startCharacter !== 0)
                writer.uint32(/* id 2, wireType 0 =*/16).int32(message.startCharacter);
            if (message.endLine != null && $Object.hasOwnProperty.call(message, "endLine") && message.endLine !== 0)
                writer.uint32(/* id 3, wireType 0 =*/24).int32(message.endLine);
            if (message.endCharacter != null && $Object.hasOwnProperty.call(message, "endCharacter") && message.endCharacter !== 0)
                writer.uint32(/* id 4, wireType 0 =*/32).int32(message.endCharacter);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified MultiLineRange message, length delimited. Does not implicitly {@link scip.MultiLineRange.verify|verify} messages.
         * @function encodeDelimited
         * @memberof scip.MultiLineRange
         * @static
         * @param {scip.MultiLineRange.$Properties} message MultiLineRange message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        MultiLineRange.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a MultiLineRange message from the specified reader or buffer.
         * @function decode
         * @memberof scip.MultiLineRange
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {scip.MultiLineRange & scip.MultiLineRange.$Shape} MultiLineRange
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        MultiLineRange.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.scip.MultiLineRange(), value;
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.startLine = value;
                        else
                            delete message.startLine;
                        continue;
                    }
                case 2: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.startCharacter = value;
                        else
                            delete message.startCharacter;
                        continue;
                    }
                case 3: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.endLine = value;
                        else
                            delete message.endLine;
                        continue;
                    }
                case 4: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.endCharacter = value;
                        else
                            delete message.endCharacter;
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a MultiLineRange message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof scip.MultiLineRange
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {scip.MultiLineRange & scip.MultiLineRange.$Shape} MultiLineRange
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        MultiLineRange.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a MultiLineRange message.
         * @function verify
         * @memberof scip.MultiLineRange
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        MultiLineRange.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.startLine != null && $Object.hasOwnProperty.call(message, "startLine"))
                if (!$util.isInteger(message.startLine))
                    return "startLine: integer expected";
            if (message.startCharacter != null && $Object.hasOwnProperty.call(message, "startCharacter"))
                if (!$util.isInteger(message.startCharacter))
                    return "startCharacter: integer expected";
            if (message.endLine != null && $Object.hasOwnProperty.call(message, "endLine"))
                if (!$util.isInteger(message.endLine))
                    return "endLine: integer expected";
            if (message.endCharacter != null && $Object.hasOwnProperty.call(message, "endCharacter"))
                if (!$util.isInteger(message.endCharacter))
                    return "endCharacter: integer expected";
            return null;
        };

        /**
         * Creates a MultiLineRange message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof scip.MultiLineRange
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {scip.MultiLineRange} MultiLineRange
         */
        MultiLineRange.fromObject = function (object, _depth) {
            if (object instanceof $root.scip.MultiLineRange)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".scip.MultiLineRange: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.scip.MultiLineRange();
            if (object.startLine != null)
                if ($Number(object.startLine) !== 0)
                    message.startLine = object.startLine | 0;
            if (object.startCharacter != null)
                if ($Number(object.startCharacter) !== 0)
                    message.startCharacter = object.startCharacter | 0;
            if (object.endLine != null)
                if ($Number(object.endLine) !== 0)
                    message.endLine = object.endLine | 0;
            if (object.endCharacter != null)
                if ($Number(object.endCharacter) !== 0)
                    message.endCharacter = object.endCharacter | 0;
            return message;
        };

        /**
         * Creates a plain object from a MultiLineRange message. Also converts values to other types if specified.
         * @function toObject
         * @memberof scip.MultiLineRange
         * @static
         * @param {scip.MultiLineRange} message MultiLineRange
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        MultiLineRange.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.defaults) {
                object.startLine = 0;
                object.startCharacter = 0;
                object.endLine = 0;
                object.endCharacter = 0;
            }
            if (message.startLine != null && $Object.hasOwnProperty.call(message, "startLine"))
                object.startLine = message.startLine;
            if (message.startCharacter != null && $Object.hasOwnProperty.call(message, "startCharacter"))
                object.startCharacter = message.startCharacter;
            if (message.endLine != null && $Object.hasOwnProperty.call(message, "endLine"))
                object.endLine = message.endLine;
            if (message.endCharacter != null && $Object.hasOwnProperty.call(message, "endCharacter"))
                object.endCharacter = message.endCharacter;
            return object;
        };

        /**
         * Converts this MultiLineRange to JSON.
         * @function toJSON
         * @memberof scip.MultiLineRange
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        MultiLineRange.prototype.toJSON = function() {
            return MultiLineRange.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for MultiLineRange
         * @function getTypeUrl
         * @memberof scip.MultiLineRange
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        MultiLineRange.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/scip.MultiLineRange";
        };

        return MultiLineRange;
    })();

    scip.Occurrence = (function() {

        /**
         * Properties of an Occurrence.
         * @typedef {Object} scip.Occurrence.$Properties
         * @property {Array.<number>|null} [range] Occurrence range
         * @property {scip.SingleLineRange.$Properties|null} [singleLineRange] Occurrence singleLineRange
         * @property {scip.MultiLineRange.$Properties|null} [multiLineRange] Occurrence multiLineRange
         * @property {string|null} [symbol] Occurrence symbol
         * @property {number|null} [symbolRoles] Occurrence symbolRoles
         * @property {Array.<string>|null} [overrideDocumentation] Occurrence overrideDocumentation
         * @property {scip.SyntaxKind|null} [syntaxKind] Occurrence syntaxKind
         * @property {Array.<scip.Diagnostic.$Properties>|null} [diagnostics] Occurrence diagnostics
         * @property {Array.<number>|null} [enclosingRange] Occurrence enclosingRange
         * @property {scip.SingleLineRange.$Properties|null} [singleLineEnclosingRange] Occurrence singleLineEnclosingRange
         * @property {scip.MultiLineRange.$Properties|null} [multiLineEnclosingRange] Occurrence multiLineEnclosingRange
         * @property {"singleLineRange"|"multiLineRange"} [typedRange] Occurrence typedRange
         * @property {"singleLineEnclosingRange"|"multiLineEnclosingRange"} [typedEnclosingRange] Occurrence typedEnclosingRange
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of an Occurrence.
         * @memberof scip
         * @interface IOccurrence
         * @augments scip.Occurrence.$Properties
         * @deprecated Use scip.Occurrence.$Properties instead.
         */

        /**
         * Narrowed shape of an Occurrence.
         * @typedef {{
         *   range?: Array.<number>|null;
         *   singleLineRange?: scip.SingleLineRange.$Shape|null;
         *   multiLineRange?: scip.MultiLineRange.$Shape|null;
         *   symbol?: string|null;
         *   symbolRoles?: number|null;
         *   overrideDocumentation?: Array.<string>|null;
         *   syntaxKind?: scip.SyntaxKind|null;
         *   diagnostics?: Array.<scip.Diagnostic.$Shape>|null;
         *   enclosingRange?: Array.<number>|null;
         *   singleLineEnclosingRange?: scip.SingleLineRange.$Shape|null;
         *   multiLineEnclosingRange?: scip.MultiLineRange.$Shape|null;
         *   $unknowns?: Array.<Uint8Array>;
         * } & (
         *   ({ typedRange?: undefined; singleLineRange?: null; multiLineRange?: null }|{ typedRange?: "singleLineRange"; singleLineRange: scip.SingleLineRange.$Shape; multiLineRange?: null }|{ typedRange?: "multiLineRange"; singleLineRange?: null; multiLineRange: scip.MultiLineRange.$Shape })
         * ) & (
         *   ({ typedEnclosingRange?: undefined; singleLineEnclosingRange?: null; multiLineEnclosingRange?: null }|{ typedEnclosingRange?: "singleLineEnclosingRange"; singleLineEnclosingRange: scip.SingleLineRange.$Shape; multiLineEnclosingRange?: null }|{ typedEnclosingRange?: "multiLineEnclosingRange"; singleLineEnclosingRange?: null; multiLineEnclosingRange: scip.MultiLineRange.$Shape })
         * )} scip.Occurrence.$Shape
         */

        /**
         * Constructs a new Occurrence.
         * @memberof scip
         * @classdesc Represents an Occurrence.
         * @constructor
         * @param {scip.Occurrence.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const Occurrence = function (properties) {
            this.range = [];
            this.overrideDocumentation = [];
            this.diagnostics = [];
            this.enclosingRange = [];
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * Occurrence range.
         * @member {Array.<number>} range
         * @memberof scip.Occurrence
         * @instance
         */
        Occurrence.prototype.range = $util.emptyArray;

        /**
         * Occurrence singleLineRange.
         * @member {scip.SingleLineRange.$Properties|null|undefined} singleLineRange
         * @memberof scip.Occurrence
         * @instance
         */
        Occurrence.prototype.singleLineRange = null;

        /**
         * Occurrence multiLineRange.
         * @member {scip.MultiLineRange.$Properties|null|undefined} multiLineRange
         * @memberof scip.Occurrence
         * @instance
         */
        Occurrence.prototype.multiLineRange = null;

        /**
         * Occurrence symbol.
         * @member {string} symbol
         * @memberof scip.Occurrence
         * @instance
         */
        Occurrence.prototype.symbol = "";

        /**
         * Occurrence symbolRoles.
         * @member {number} symbolRoles
         * @memberof scip.Occurrence
         * @instance
         */
        Occurrence.prototype.symbolRoles = 0;

        /**
         * Occurrence overrideDocumentation.
         * @member {Array.<string>} overrideDocumentation
         * @memberof scip.Occurrence
         * @instance
         */
        Occurrence.prototype.overrideDocumentation = $util.emptyArray;

        /**
         * Occurrence syntaxKind.
         * @member {scip.SyntaxKind} syntaxKind
         * @memberof scip.Occurrence
         * @instance
         */
        Occurrence.prototype.syntaxKind = 0;

        /**
         * Occurrence diagnostics.
         * @member {Array.<scip.Diagnostic.$Properties>} diagnostics
         * @memberof scip.Occurrence
         * @instance
         */
        Occurrence.prototype.diagnostics = $util.emptyArray;

        /**
         * Occurrence enclosingRange.
         * @member {Array.<number>} enclosingRange
         * @memberof scip.Occurrence
         * @instance
         */
        Occurrence.prototype.enclosingRange = $util.emptyArray;

        /**
         * Occurrence singleLineEnclosingRange.
         * @member {scip.SingleLineRange.$Properties|null|undefined} singleLineEnclosingRange
         * @memberof scip.Occurrence
         * @instance
         */
        Occurrence.prototype.singleLineEnclosingRange = null;

        /**
         * Occurrence multiLineEnclosingRange.
         * @member {scip.MultiLineRange.$Properties|null|undefined} multiLineEnclosingRange
         * @memberof scip.Occurrence
         * @instance
         */
        Occurrence.prototype.multiLineEnclosingRange = null;

        // OneOf field names bound to virtual getters and setters
        let $oneOfFields;

        /**
         * Occurrence typedRange.
         * @member {"singleLineRange"|"multiLineRange"|undefined} typedRange
         * @memberof scip.Occurrence
         * @instance
         */
        $Object.defineProperty(Occurrence.prototype, "typedRange", {
            get: $util.oneOfGetter($oneOfFields = ["singleLineRange", "multiLineRange"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Occurrence typedEnclosingRange.
         * @member {"singleLineEnclosingRange"|"multiLineEnclosingRange"|undefined} typedEnclosingRange
         * @memberof scip.Occurrence
         * @instance
         */
        $Object.defineProperty(Occurrence.prototype, "typedEnclosingRange", {
            get: $util.oneOfGetter($oneOfFields = ["singleLineEnclosingRange", "multiLineEnclosingRange"]),
            set: $util.oneOfSetter($oneOfFields)
        });

        /**
         * Creates a new Occurrence instance using the specified properties.
         * @function create
         * @memberof scip.Occurrence
         * @static
         * @param {scip.Occurrence.$Properties=} [properties] Properties to set
         * @returns {scip.Occurrence} Occurrence instance
         * @type {{
         *   (properties: scip.Occurrence.$Shape): scip.Occurrence & scip.Occurrence.$Shape;
         *   (properties?: scip.Occurrence.$Properties): scip.Occurrence;
         * }}
         */
        Occurrence.create = function(properties) {
            return new Occurrence(properties);
        };

        /**
         * Encodes the specified Occurrence message. Does not implicitly {@link scip.Occurrence.verify|verify} messages.
         * @function encode
         * @memberof scip.Occurrence
         * @static
         * @param {scip.Occurrence.$Properties} message Occurrence message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Occurrence.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.range != null && message.range.length)
                writer.uint32(/* id 1, wireType 2 =*/10).int32s(message.range);
            if (message.symbol != null && $Object.hasOwnProperty.call(message, "symbol") && message.symbol !== "")
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.symbol);
            if (message.symbolRoles != null && $Object.hasOwnProperty.call(message, "symbolRoles") && message.symbolRoles !== 0)
                writer.uint32(/* id 3, wireType 0 =*/24).int32(message.symbolRoles);
            if (message.overrideDocumentation != null && message.overrideDocumentation.length)
                for (let i = 0; i < message.overrideDocumentation.length; ++i)
                    writer.uint32(/* id 4, wireType 2 =*/34).string(message.overrideDocumentation[i]);
            if (message.syntaxKind != null && $Object.hasOwnProperty.call(message, "syntaxKind") && message.syntaxKind !== 0)
                writer.uint32(/* id 5, wireType 0 =*/40).int32(message.syntaxKind);
            if (message.diagnostics != null && message.diagnostics.length)
                for (let i = 0; i < message.diagnostics.length; ++i)
                    $root.scip.Diagnostic.encode(message.diagnostics[i], writer.uint32(/* id 6, wireType 2 =*/50).fork(), _depth + 1).ldelim();
            if (message.enclosingRange != null && message.enclosingRange.length)
                writer.uint32(/* id 7, wireType 2 =*/58).int32s(message.enclosingRange);
            if (message.singleLineRange != null && $Object.hasOwnProperty.call(message, "singleLineRange"))
                $root.scip.SingleLineRange.encode(message.singleLineRange, writer.uint32(/* id 8, wireType 2 =*/66).fork(), _depth + 1).ldelim();
            if (message.multiLineRange != null && $Object.hasOwnProperty.call(message, "multiLineRange"))
                $root.scip.MultiLineRange.encode(message.multiLineRange, writer.uint32(/* id 9, wireType 2 =*/74).fork(), _depth + 1).ldelim();
            if (message.singleLineEnclosingRange != null && $Object.hasOwnProperty.call(message, "singleLineEnclosingRange"))
                $root.scip.SingleLineRange.encode(message.singleLineEnclosingRange, writer.uint32(/* id 10, wireType 2 =*/82).fork(), _depth + 1).ldelim();
            if (message.multiLineEnclosingRange != null && $Object.hasOwnProperty.call(message, "multiLineEnclosingRange"))
                $root.scip.MultiLineRange.encode(message.multiLineEnclosingRange, writer.uint32(/* id 11, wireType 2 =*/90).fork(), _depth + 1).ldelim();
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified Occurrence message, length delimited. Does not implicitly {@link scip.Occurrence.verify|verify} messages.
         * @function encodeDelimited
         * @memberof scip.Occurrence
         * @static
         * @param {scip.Occurrence.$Properties} message Occurrence message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Occurrence.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes an Occurrence message from the specified reader or buffer.
         * @function decode
         * @memberof scip.Occurrence
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {scip.Occurrence & scip.Occurrence.$Shape} Occurrence
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Occurrence.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.scip.Occurrence(), value;
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType === 2) {
                            if (!(message.range && message.range.length))
                                message.range = [];
                            reader.int32s(message.range);
                            continue;
                        }
                        if (wireType !== 0)
                            break;
                        if (!(message.range && message.range.length))
                            message.range = [];
                        message.range.push(reader.int32());
                        continue;
                    }
                case 8: {
                        if (wireType !== 2)
                            break;
                        message.singleLineRange = $root.scip.SingleLineRange.decode(reader, reader.uint32(), $undefined, _depth + 1, message.singleLineRange);
                        message.typedRange = "singleLineRange";
                        continue;
                    }
                case 9: {
                        if (wireType !== 2)
                            break;
                        message.multiLineRange = $root.scip.MultiLineRange.decode(reader, reader.uint32(), $undefined, _depth + 1, message.multiLineRange);
                        message.typedRange = "multiLineRange";
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.symbol = value;
                        else
                            delete message.symbol;
                        continue;
                    }
                case 3: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.symbolRoles = value;
                        else
                            delete message.symbolRoles;
                        continue;
                    }
                case 4: {
                        if (wireType !== 2)
                            break;
                        if (!(message.overrideDocumentation && message.overrideDocumentation.length))
                            message.overrideDocumentation = [];
                        message.overrideDocumentation.push(reader.stringVerify());
                        continue;
                    }
                case 5: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.syntaxKind = value;
                        else
                            delete message.syntaxKind;
                        continue;
                    }
                case 6: {
                        if (wireType !== 2)
                            break;
                        if (!(message.diagnostics && message.diagnostics.length))
                            message.diagnostics = [];
                        message.diagnostics.push($root.scip.Diagnostic.decode(reader, reader.uint32(), $undefined, _depth + 1));
                        continue;
                    }
                case 7: {
                        if (wireType === 2) {
                            if (!(message.enclosingRange && message.enclosingRange.length))
                                message.enclosingRange = [];
                            reader.int32s(message.enclosingRange);
                            continue;
                        }
                        if (wireType !== 0)
                            break;
                        if (!(message.enclosingRange && message.enclosingRange.length))
                            message.enclosingRange = [];
                        message.enclosingRange.push(reader.int32());
                        continue;
                    }
                case 10: {
                        if (wireType !== 2)
                            break;
                        message.singleLineEnclosingRange = $root.scip.SingleLineRange.decode(reader, reader.uint32(), $undefined, _depth + 1, message.singleLineEnclosingRange);
                        message.typedEnclosingRange = "singleLineEnclosingRange";
                        continue;
                    }
                case 11: {
                        if (wireType !== 2)
                            break;
                        message.multiLineEnclosingRange = $root.scip.MultiLineRange.decode(reader, reader.uint32(), $undefined, _depth + 1, message.multiLineEnclosingRange);
                        message.typedEnclosingRange = "multiLineEnclosingRange";
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes an Occurrence message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof scip.Occurrence
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {scip.Occurrence & scip.Occurrence.$Shape} Occurrence
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Occurrence.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies an Occurrence message.
         * @function verify
         * @memberof scip.Occurrence
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Occurrence.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            let properties = {};
            if (message.range != null && $Object.hasOwnProperty.call(message, "range")) {
                if (!$Array.isArray(message.range))
                    return "range: array expected";
                for (let i = 0; i < message.range.length; ++i)
                    if (!$util.isInteger(message.range[i]))
                        return "range: integer[] expected";
            }
            if (message.singleLineRange != null && $Object.hasOwnProperty.call(message, "singleLineRange")) {
                properties.typedRange = 1;
                {
                    let error = $root.scip.SingleLineRange.verify(message.singleLineRange, _depth + 1);
                    if (error)
                        return "singleLineRange." + error;
                }
            }
            if (message.multiLineRange != null && $Object.hasOwnProperty.call(message, "multiLineRange")) {
                if (properties.typedRange === 1)
                    return "typedRange: multiple values";
                properties.typedRange = 1;
                {
                    let error = $root.scip.MultiLineRange.verify(message.multiLineRange, _depth + 1);
                    if (error)
                        return "multiLineRange." + error;
                }
            }
            if (message.symbol != null && $Object.hasOwnProperty.call(message, "symbol"))
                if (!$util.isString(message.symbol))
                    return "symbol: string expected";
            if (message.symbolRoles != null && $Object.hasOwnProperty.call(message, "symbolRoles"))
                if (!$util.isInteger(message.symbolRoles))
                    return "symbolRoles: integer expected";
            if (message.overrideDocumentation != null && $Object.hasOwnProperty.call(message, "overrideDocumentation")) {
                if (!$Array.isArray(message.overrideDocumentation))
                    return "overrideDocumentation: array expected";
                for (let i = 0; i < message.overrideDocumentation.length; ++i)
                    if (!$util.isString(message.overrideDocumentation[i]))
                        return "overrideDocumentation: string[] expected";
            }
            if (message.syntaxKind != null && $Object.hasOwnProperty.call(message, "syntaxKind"))
                if (typeof message.syntaxKind !== "number" || (message.syntaxKind | 0) !== message.syntaxKind)
                    return "syntaxKind: enum value expected";
            if (message.diagnostics != null && $Object.hasOwnProperty.call(message, "diagnostics")) {
                if (!$Array.isArray(message.diagnostics))
                    return "diagnostics: array expected";
                for (let i = 0; i < message.diagnostics.length; ++i) {
                    let error = $root.scip.Diagnostic.verify(message.diagnostics[i], _depth + 1);
                    if (error)
                        return "diagnostics." + error;
                }
            }
            if (message.enclosingRange != null && $Object.hasOwnProperty.call(message, "enclosingRange")) {
                if (!$Array.isArray(message.enclosingRange))
                    return "enclosingRange: array expected";
                for (let i = 0; i < message.enclosingRange.length; ++i)
                    if (!$util.isInteger(message.enclosingRange[i]))
                        return "enclosingRange: integer[] expected";
            }
            if (message.singleLineEnclosingRange != null && $Object.hasOwnProperty.call(message, "singleLineEnclosingRange")) {
                properties.typedEnclosingRange = 1;
                {
                    let error = $root.scip.SingleLineRange.verify(message.singleLineEnclosingRange, _depth + 1);
                    if (error)
                        return "singleLineEnclosingRange." + error;
                }
            }
            if (message.multiLineEnclosingRange != null && $Object.hasOwnProperty.call(message, "multiLineEnclosingRange")) {
                if (properties.typedEnclosingRange === 1)
                    return "typedEnclosingRange: multiple values";
                properties.typedEnclosingRange = 1;
                {
                    let error = $root.scip.MultiLineRange.verify(message.multiLineEnclosingRange, _depth + 1);
                    if (error)
                        return "multiLineEnclosingRange." + error;
                }
            }
            return null;
        };

        /**
         * Creates an Occurrence message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof scip.Occurrence
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {scip.Occurrence} Occurrence
         */
        Occurrence.fromObject = function (object, _depth) {
            if (object instanceof $root.scip.Occurrence)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".scip.Occurrence: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.scip.Occurrence();
            if (object.range) {
                if (!$Array.isArray(object.range))
                    throw $TypeError(".scip.Occurrence.range: array expected");
                message.range = $Array(object.range.length);
                for (let i = 0; i < object.range.length; ++i)
                    message.range[i] = object.range[i] | 0;
            }
            if (object.singleLineRange != null) {
                if (!$util.isObject(object.singleLineRange))
                    throw $TypeError(".scip.Occurrence.singleLineRange: object expected");
                message.singleLineRange = $root.scip.SingleLineRange.fromObject(object.singleLineRange, _depth + 1);
            }
            if (object.multiLineRange != null) {
                if (!$util.isObject(object.multiLineRange))
                    throw $TypeError(".scip.Occurrence.multiLineRange: object expected");
                message.multiLineRange = $root.scip.MultiLineRange.fromObject(object.multiLineRange, _depth + 1);
            }
            if (object.symbol != null)
                if (typeof object.symbol !== "string" || object.symbol.length)
                    message.symbol = $String(object.symbol);
            if (object.symbolRoles != null)
                if ($Number(object.symbolRoles) !== 0)
                    message.symbolRoles = object.symbolRoles | 0;
            if (object.overrideDocumentation) {
                if (!$Array.isArray(object.overrideDocumentation))
                    throw $TypeError(".scip.Occurrence.overrideDocumentation: array expected");
                message.overrideDocumentation = $Array(object.overrideDocumentation.length);
                for (let i = 0; i < object.overrideDocumentation.length; ++i)
                    message.overrideDocumentation[i] = $String(object.overrideDocumentation[i]);
            }
            if (object.syntaxKind !== 0 && (typeof object.syntaxKind !== "string" || $root.scip.SyntaxKind[object.syntaxKind] !== 0))
                switch (object.syntaxKind) {
                case "UnspecifiedSyntaxKind":
                case 0:
                    message.syntaxKind = 0;
                    break;
                case "Comment":
                case 1:
                    message.syntaxKind = 1;
                    break;
                case "PunctuationDelimiter":
                case 2:
                    message.syntaxKind = 2;
                    break;
                case "PunctuationBracket":
                case 3:
                    message.syntaxKind = 3;
                    break;
                case "Keyword":
                case 4:
                    message.syntaxKind = 4;
                    break;
                case "IdentifierKeyword":
                case 4:
                    message.syntaxKind = 4;
                    break;
                case "IdentifierOperator":
                case 5:
                    message.syntaxKind = 5;
                    break;
                case "Identifier":
                case 6:
                    message.syntaxKind = 6;
                    break;
                case "IdentifierBuiltin":
                case 7:
                    message.syntaxKind = 7;
                    break;
                case "IdentifierNull":
                case 8:
                    message.syntaxKind = 8;
                    break;
                case "IdentifierConstant":
                case 9:
                    message.syntaxKind = 9;
                    break;
                case "IdentifierMutableGlobal":
                case 10:
                    message.syntaxKind = 10;
                    break;
                case "IdentifierParameter":
                case 11:
                    message.syntaxKind = 11;
                    break;
                case "IdentifierLocal":
                case 12:
                    message.syntaxKind = 12;
                    break;
                case "IdentifierShadowed":
                case 13:
                    message.syntaxKind = 13;
                    break;
                case "IdentifierNamespace":
                case 14:
                    message.syntaxKind = 14;
                    break;
                case "IdentifierModule":
                case 14:
                    message.syntaxKind = 14;
                    break;
                case "IdentifierFunction":
                case 15:
                    message.syntaxKind = 15;
                    break;
                case "IdentifierFunctionDefinition":
                case 16:
                    message.syntaxKind = 16;
                    break;
                case "IdentifierMacro":
                case 17:
                    message.syntaxKind = 17;
                    break;
                case "IdentifierMacroDefinition":
                case 18:
                    message.syntaxKind = 18;
                    break;
                case "IdentifierType":
                case 19:
                    message.syntaxKind = 19;
                    break;
                case "IdentifierBuiltinType":
                case 20:
                    message.syntaxKind = 20;
                    break;
                case "IdentifierAttribute":
                case 21:
                    message.syntaxKind = 21;
                    break;
                case "RegexEscape":
                case 22:
                    message.syntaxKind = 22;
                    break;
                case "RegexRepeated":
                case 23:
                    message.syntaxKind = 23;
                    break;
                case "RegexWildcard":
                case 24:
                    message.syntaxKind = 24;
                    break;
                case "RegexDelimiter":
                case 25:
                    message.syntaxKind = 25;
                    break;
                case "RegexJoin":
                case 26:
                    message.syntaxKind = 26;
                    break;
                case "StringLiteral":
                case 27:
                    message.syntaxKind = 27;
                    break;
                case "StringLiteralEscape":
                case 28:
                    message.syntaxKind = 28;
                    break;
                case "StringLiteralSpecial":
                case 29:
                    message.syntaxKind = 29;
                    break;
                case "StringLiteralKey":
                case 30:
                    message.syntaxKind = 30;
                    break;
                case "CharacterLiteral":
                case 31:
                    message.syntaxKind = 31;
                    break;
                case "NumericLiteral":
                case 32:
                    message.syntaxKind = 32;
                    break;
                case "BooleanLiteral":
                case 33:
                    message.syntaxKind = 33;
                    break;
                case "Tag":
                case 34:
                    message.syntaxKind = 34;
                    break;
                case "TagAttribute":
                case 35:
                    message.syntaxKind = 35;
                    break;
                case "TagDelimiter":
                case 36:
                    message.syntaxKind = 36;
                    break;
                default:
                    if (typeof object.syntaxKind === "number" && (object.syntaxKind | 0) === object.syntaxKind)
                        message.syntaxKind = object.syntaxKind;
                }
            if (object.diagnostics) {
                if (!$Array.isArray(object.diagnostics))
                    throw $TypeError(".scip.Occurrence.diagnostics: array expected");
                message.diagnostics = $Array(object.diagnostics.length);
                for (let i = 0; i < object.diagnostics.length; ++i) {
                    if (!$util.isObject(object.diagnostics[i]))
                        throw $TypeError(".scip.Occurrence.diagnostics: object expected");
                    message.diagnostics[i] = $root.scip.Diagnostic.fromObject(object.diagnostics[i], _depth + 1);
                }
            }
            if (object.enclosingRange) {
                if (!$Array.isArray(object.enclosingRange))
                    throw $TypeError(".scip.Occurrence.enclosingRange: array expected");
                message.enclosingRange = $Array(object.enclosingRange.length);
                for (let i = 0; i < object.enclosingRange.length; ++i)
                    message.enclosingRange[i] = object.enclosingRange[i] | 0;
            }
            if (object.singleLineEnclosingRange != null) {
                if (!$util.isObject(object.singleLineEnclosingRange))
                    throw $TypeError(".scip.Occurrence.singleLineEnclosingRange: object expected");
                message.singleLineEnclosingRange = $root.scip.SingleLineRange.fromObject(object.singleLineEnclosingRange, _depth + 1);
            }
            if (object.multiLineEnclosingRange != null) {
                if (!$util.isObject(object.multiLineEnclosingRange))
                    throw $TypeError(".scip.Occurrence.multiLineEnclosingRange: object expected");
                message.multiLineEnclosingRange = $root.scip.MultiLineRange.fromObject(object.multiLineEnclosingRange, _depth + 1);
            }
            return message;
        };

        /**
         * Creates a plain object from an Occurrence message. Also converts values to other types if specified.
         * @function toObject
         * @memberof scip.Occurrence
         * @static
         * @param {scip.Occurrence} message Occurrence
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Occurrence.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.arrays || options.defaults) {
                object.range = [];
                object.overrideDocumentation = [];
                object.diagnostics = [];
                object.enclosingRange = [];
            }
            if (options.defaults) {
                object.symbol = "";
                object.symbolRoles = 0;
                object.syntaxKind = options.enums === $String ? "UnspecifiedSyntaxKind" : 0;
            }
            if (message.range && message.range.length) {
                object.range = $Array(message.range.length);
                for (let j = 0; j < message.range.length; ++j)
                    object.range[j] = message.range[j];
            }
            if (message.symbol != null && $Object.hasOwnProperty.call(message, "symbol"))
                object.symbol = message.symbol;
            if (message.symbolRoles != null && $Object.hasOwnProperty.call(message, "symbolRoles"))
                object.symbolRoles = message.symbolRoles;
            if (message.overrideDocumentation && message.overrideDocumentation.length) {
                object.overrideDocumentation = $Array(message.overrideDocumentation.length);
                for (let j = 0; j < message.overrideDocumentation.length; ++j)
                    object.overrideDocumentation[j] = message.overrideDocumentation[j];
            }
            if (message.syntaxKind != null && $Object.hasOwnProperty.call(message, "syntaxKind"))
                object.syntaxKind = options.enums === $String ? $root.scip.SyntaxKind[message.syntaxKind] === $undefined ? message.syntaxKind : $root.scip.SyntaxKind[message.syntaxKind] : message.syntaxKind;
            if (message.diagnostics && message.diagnostics.length) {
                object.diagnostics = $Array(message.diagnostics.length);
                for (let j = 0; j < message.diagnostics.length; ++j)
                    object.diagnostics[j] = $root.scip.Diagnostic.toObject(message.diagnostics[j], options, _depth + 1);
            }
            if (message.enclosingRange && message.enclosingRange.length) {
                object.enclosingRange = $Array(message.enclosingRange.length);
                for (let j = 0; j < message.enclosingRange.length; ++j)
                    object.enclosingRange[j] = message.enclosingRange[j];
            }
            if (message.singleLineRange != null && $Object.hasOwnProperty.call(message, "singleLineRange")) {
                object.singleLineRange = $root.scip.SingleLineRange.toObject(message.singleLineRange, options, _depth + 1);
                if (options.oneofs)
                    object.typedRange = "singleLineRange";
            }
            if (message.multiLineRange != null && $Object.hasOwnProperty.call(message, "multiLineRange")) {
                object.multiLineRange = $root.scip.MultiLineRange.toObject(message.multiLineRange, options, _depth + 1);
                if (options.oneofs)
                    object.typedRange = "multiLineRange";
            }
            if (message.singleLineEnclosingRange != null && $Object.hasOwnProperty.call(message, "singleLineEnclosingRange")) {
                object.singleLineEnclosingRange = $root.scip.SingleLineRange.toObject(message.singleLineEnclosingRange, options, _depth + 1);
                if (options.oneofs)
                    object.typedEnclosingRange = "singleLineEnclosingRange";
            }
            if (message.multiLineEnclosingRange != null && $Object.hasOwnProperty.call(message, "multiLineEnclosingRange")) {
                object.multiLineEnclosingRange = $root.scip.MultiLineRange.toObject(message.multiLineEnclosingRange, options, _depth + 1);
                if (options.oneofs)
                    object.typedEnclosingRange = "multiLineEnclosingRange";
            }
            return object;
        };

        /**
         * Converts this Occurrence to JSON.
         * @function toJSON
         * @memberof scip.Occurrence
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Occurrence.prototype.toJSON = function() {
            return Occurrence.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for Occurrence
         * @function getTypeUrl
         * @memberof scip.Occurrence
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        Occurrence.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/scip.Occurrence";
        };

        return Occurrence;
    })();

    scip.Diagnostic = (function() {

        /**
         * Properties of a Diagnostic.
         * @typedef {Object} scip.Diagnostic.$Properties
         * @property {scip.Severity|null} [severity] Diagnostic severity
         * @property {string|null} [code] Diagnostic code
         * @property {string|null} [message] Diagnostic message
         * @property {string|null} [source] Diagnostic source
         * @property {Array.<scip.DiagnosticTag>|null} [tags] Diagnostic tags
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */

        /**
         * Properties of a Diagnostic.
         * @memberof scip
         * @interface IDiagnostic
         * @augments scip.Diagnostic.$Properties
         * @deprecated Use scip.Diagnostic.$Properties instead.
         */

        /**
         * Shape of a Diagnostic.
         * @typedef {scip.Diagnostic.$Properties} scip.Diagnostic.$Shape
         */

        /**
         * Constructs a new Diagnostic.
         * @memberof scip
         * @classdesc Represents a Diagnostic.
         * @constructor
         * @param {scip.Diagnostic.$Properties=} [properties] Properties to set
         * @property {Array.<Uint8Array>} [$unknowns] Unknown fields preserved while decoding when enabled
         */
        const Diagnostic = function (properties) {
            this.tags = [];
            if (properties)
                for (let keys = $Object.keys(properties), i = 0; i < keys.length; ++i)
                    if (properties[keys[i]] != null && keys[i] !== "__proto__")
                        this[keys[i]] = properties[keys[i]];
        };

        /**
         * Diagnostic severity.
         * @member {scip.Severity} severity
         * @memberof scip.Diagnostic
         * @instance
         */
        Diagnostic.prototype.severity = 0;

        /**
         * Diagnostic code.
         * @member {string} code
         * @memberof scip.Diagnostic
         * @instance
         */
        Diagnostic.prototype.code = "";

        /**
         * Diagnostic message.
         * @member {string} message
         * @memberof scip.Diagnostic
         * @instance
         */
        Diagnostic.prototype.message = "";

        /**
         * Diagnostic source.
         * @member {string} source
         * @memberof scip.Diagnostic
         * @instance
         */
        Diagnostic.prototype.source = "";

        /**
         * Diagnostic tags.
         * @member {Array.<scip.DiagnosticTag>} tags
         * @memberof scip.Diagnostic
         * @instance
         */
        Diagnostic.prototype.tags = $util.emptyArray;

        /**
         * Creates a new Diagnostic instance using the specified properties.
         * @function create
         * @memberof scip.Diagnostic
         * @static
         * @param {scip.Diagnostic.$Properties=} [properties] Properties to set
         * @returns {scip.Diagnostic} Diagnostic instance
         * @type {{
         *   (properties: scip.Diagnostic.$Shape): scip.Diagnostic & scip.Diagnostic.$Shape;
         *   (properties?: scip.Diagnostic.$Properties): scip.Diagnostic;
         * }}
         */
        Diagnostic.create = function(properties) {
            return new Diagnostic(properties);
        };

        /**
         * Encodes the specified Diagnostic message. Does not implicitly {@link scip.Diagnostic.verify|verify} messages.
         * @function encode
         * @memberof scip.Diagnostic
         * @static
         * @param {scip.Diagnostic.$Properties} message Diagnostic message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Diagnostic.encode = function (message, writer, _depth) {
            if (!writer)
                writer = $Writer.create();
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            if (message.severity != null && $Object.hasOwnProperty.call(message, "severity") && message.severity !== 0)
                writer.uint32(/* id 1, wireType 0 =*/8).int32(message.severity);
            if (message.code != null && $Object.hasOwnProperty.call(message, "code") && message.code !== "")
                writer.uint32(/* id 2, wireType 2 =*/18).string(message.code);
            if (message.message != null && $Object.hasOwnProperty.call(message, "message") && message.message !== "")
                writer.uint32(/* id 3, wireType 2 =*/26).string(message.message);
            if (message.source != null && $Object.hasOwnProperty.call(message, "source") && message.source !== "")
                writer.uint32(/* id 4, wireType 2 =*/34).string(message.source);
            if (message.tags != null && message.tags.length)
                writer.uint32(/* id 5, wireType 2 =*/42).int32s(message.tags);
            if (message.$unknowns != null && $Object.hasOwnProperty.call(message, "$unknowns"))
                for (let i = 0; i < message.$unknowns.length; ++i)
                    writer.raw(message.$unknowns[i]);
            return writer;
        };

        /**
         * Encodes the specified Diagnostic message, length delimited. Does not implicitly {@link scip.Diagnostic.verify|verify} messages.
         * @function encodeDelimited
         * @memberof scip.Diagnostic
         * @static
         * @param {scip.Diagnostic.$Properties} message Diagnostic message or plain object to encode
         * @param {$protobuf.Writer} [writer] Writer to encode to
         * @returns {$protobuf.Writer} Writer
         */
        Diagnostic.encodeDelimited = function(message, writer) {
            return this.encode(message, (writer || $Writer.create()).fork()).ldelim();
        };

        /**
         * Decodes a Diagnostic message from the specified reader or buffer.
         * @function decode
         * @memberof scip.Diagnostic
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @param {number} [length] Message length if known beforehand
         * @returns {scip.Diagnostic & scip.Diagnostic.$Shape} Diagnostic
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Diagnostic.decode = function (reader, length, _end, _depth, _target) {
            if (!(reader instanceof $Reader))
                reader = $Reader.create(reader);
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $Reader.recursionLimit)
                throw $Error("max depth exceeded");
            let end = length === $undefined ? reader.len : reader.pos + length, message = _target || new $root.scip.Diagnostic(), value;
            while (reader.pos < end) {
                let start = reader.pos;
                let tag = reader.tag();
                if (tag === _end) {
                    _end = $undefined;
                    break;
                }
                let wireType = tag & 7;
                switch (tag >>>= 3) {
                case 1: {
                        if (wireType !== 0)
                            break;
                        if (value = reader.int32())
                            message.severity = value;
                        else
                            delete message.severity;
                        continue;
                    }
                case 2: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.code = value;
                        else
                            delete message.code;
                        continue;
                    }
                case 3: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.message = value;
                        else
                            delete message.message;
                        continue;
                    }
                case 4: {
                        if (wireType !== 2)
                            break;
                        if ((value = reader.stringVerify()).length)
                            message.source = value;
                        else
                            delete message.source;
                        continue;
                    }
                case 5: {
                        if (wireType === 2) {
                            if (!(message.tags && message.tags.length))
                                message.tags = [];
                            reader.int32s(message.tags);
                            continue;
                        }
                        if (wireType !== 0)
                            break;
                        if (!(message.tags && message.tags.length))
                            message.tags = [];
                        message.tags.push(reader.int32());
                        continue;
                    }
                }
                reader.skipType(wireType, _depth, tag);
                if (!reader.discardUnknown) {
                    $util.makeProp(message, "$unknowns", false);
                    (message.$unknowns || (message.$unknowns = [])).push(reader.raw(start, reader.pos));
                }
            }
            if (_end !== $undefined)
                throw $Error("missing end group");
            return message;
        };

        /**
         * Decodes a Diagnostic message from the specified reader or buffer, length delimited.
         * @function decodeDelimited
         * @memberof scip.Diagnostic
         * @static
         * @param {$protobuf.Reader|Uint8Array} reader Reader or buffer to decode from
         * @returns {scip.Diagnostic & scip.Diagnostic.$Shape} Diagnostic
         * @throws {Error} If the payload is not a reader or valid buffer
         * @throws {$protobuf.util.ProtocolError} If required fields are missing
         */
        Diagnostic.decodeDelimited = function(reader) {
            if (!(reader instanceof $Reader))
                reader = new $Reader(reader);
            return this.decode(reader, reader.uint32());
        };

        /**
         * Verifies a Diagnostic message.
         * @function verify
         * @memberof scip.Diagnostic
         * @static
         * @param {Object.<string,*>} message Plain object to verify
         * @returns {string|null} `null` if valid, otherwise the reason why it is not
         */
        Diagnostic.verify = function (message, _depth) {
            if (typeof message !== "object" || message === null)
                return "object expected";
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                return "max depth exceeded";
            if (message.severity != null && $Object.hasOwnProperty.call(message, "severity"))
                if (typeof message.severity !== "number" || (message.severity | 0) !== message.severity)
                    return "severity: enum value expected";
            if (message.code != null && $Object.hasOwnProperty.call(message, "code"))
                if (!$util.isString(message.code))
                    return "code: string expected";
            if (message.message != null && $Object.hasOwnProperty.call(message, "message"))
                if (!$util.isString(message.message))
                    return "message: string expected";
            if (message.source != null && $Object.hasOwnProperty.call(message, "source"))
                if (!$util.isString(message.source))
                    return "source: string expected";
            if (message.tags != null && $Object.hasOwnProperty.call(message, "tags")) {
                if (!$Array.isArray(message.tags))
                    return "tags: array expected";
                for (let i = 0; i < message.tags.length; ++i)
                    if (typeof message.tags[i] !== "number" || (message.tags[i] | 0) !== message.tags[i])
                        return "tags: enum value[] expected";
            }
            return null;
        };

        /**
         * Creates a Diagnostic message from a plain object. Also converts values to their respective internal types.
         * @function fromObject
         * @memberof scip.Diagnostic
         * @static
         * @param {Object.<string,*>} object Plain object
         * @returns {scip.Diagnostic} Diagnostic
         */
        Diagnostic.fromObject = function (object, _depth) {
            if (object instanceof $root.scip.Diagnostic)
                return object;
            if (!$util.isObject(object))
                throw $TypeError(".scip.Diagnostic: object expected");
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let message = new $root.scip.Diagnostic();
            if (object.severity !== 0 && (typeof object.severity !== "string" || $root.scip.Severity[object.severity] !== 0))
                switch (object.severity) {
                case "UnspecifiedSeverity":
                case 0:
                    message.severity = 0;
                    break;
                case "Error":
                case 1:
                    message.severity = 1;
                    break;
                case "Warning":
                case 2:
                    message.severity = 2;
                    break;
                case "Information":
                case 3:
                    message.severity = 3;
                    break;
                case "Hint":
                case 4:
                    message.severity = 4;
                    break;
                default:
                    if (typeof object.severity === "number" && (object.severity | 0) === object.severity)
                        message.severity = object.severity;
                }
            if (object.code != null)
                if (typeof object.code !== "string" || object.code.length)
                    message.code = $String(object.code);
            if (object.message != null)
                if (typeof object.message !== "string" || object.message.length)
                    message.message = $String(object.message);
            if (object.source != null)
                if (typeof object.source !== "string" || object.source.length)
                    message.source = $String(object.source);
            if (object.tags) {
                if (!$Array.isArray(object.tags))
                    throw $TypeError(".scip.Diagnostic.tags: array expected");
                message.tags = [];
                for (let i = 0; i < object.tags.length; ++i)
                    switch (object.tags[i]) {
                    case "UnspecifiedDiagnosticTag":
                    case 0:
                        message.tags[message.tags.length] = 0;
                        break;
                    case "Unnecessary":
                    case 1:
                        message.tags[message.tags.length] = 1;
                        break;
                    case "Deprecated":
                    case 2:
                        message.tags[message.tags.length] = 2;
                        break;
                    default:
                        if (typeof object.tags[i] === "number" && (object.tags[i] | 0) === object.tags[i])
                            message.tags[message.tags.length] = object.tags[i];
                    }
            }
            return message;
        };

        /**
         * Creates a plain object from a Diagnostic message. Also converts values to other types if specified.
         * @function toObject
         * @memberof scip.Diagnostic
         * @static
         * @param {scip.Diagnostic} message Diagnostic
         * @param {$protobuf.IConversionOptions} [options] Conversion options
         * @returns {Object.<string,*>} Plain object
         */
        Diagnostic.toObject = function (message, options, _depth) {
            if (!options)
                options = {};
            if (_depth === $undefined)
                _depth = 0;
            if (_depth > $util.recursionLimit)
                throw $Error("max depth exceeded");
            let object = {};
            if (options.arrays || options.defaults)
                object.tags = [];
            if (options.defaults) {
                object.severity = options.enums === $String ? "UnspecifiedSeverity" : 0;
                object.code = "";
                object.message = "";
                object.source = "";
            }
            if (message.severity != null && $Object.hasOwnProperty.call(message, "severity"))
                object.severity = options.enums === $String ? $root.scip.Severity[message.severity] === $undefined ? message.severity : $root.scip.Severity[message.severity] : message.severity;
            if (message.code != null && $Object.hasOwnProperty.call(message, "code"))
                object.code = message.code;
            if (message.message != null && $Object.hasOwnProperty.call(message, "message"))
                object.message = message.message;
            if (message.source != null && $Object.hasOwnProperty.call(message, "source"))
                object.source = message.source;
            if (message.tags && message.tags.length) {
                object.tags = $Array(message.tags.length);
                for (let j = 0; j < message.tags.length; ++j)
                    object.tags[j] = options.enums === $String ? $root.scip.DiagnosticTag[message.tags[j]] === $undefined ? message.tags[j] : $root.scip.DiagnosticTag[message.tags[j]] : message.tags[j];
            }
            return object;
        };

        /**
         * Converts this Diagnostic to JSON.
         * @function toJSON
         * @memberof scip.Diagnostic
         * @instance
         * @returns {Object.<string,*>} JSON object
         */
        Diagnostic.prototype.toJSON = function() {
            return Diagnostic.toObject(this, $protobuf.util.toJSONOptions);
        };

        /**
         * Gets the type url for Diagnostic
         * @function getTypeUrl
         * @memberof scip.Diagnostic
         * @static
         * @param {string} [prefix] Custom type url prefix, defaults to `"type.googleapis.com"`
         * @returns {string} The type url
         */
        Diagnostic.getTypeUrl = function(prefix) {
            if (prefix === $undefined)
                prefix = "type.googleapis.com";
            return prefix + "/scip.Diagnostic";
        };

        return Diagnostic;
    })();

    /**
     * Severity enum.
     * @name scip.Severity
     * @enum {number}
     * @property {number} UnspecifiedSeverity=0 UnspecifiedSeverity value
     * @property {number} Error=1 Error value
     * @property {number} Warning=2 Warning value
     * @property {number} Information=3 Information value
     * @property {number} Hint=4 Hint value
     */
    scip.Severity = (function() {
        const valuesById = $Object.create(null), values = $Object.create(valuesById);
        values[valuesById[0] = "UnspecifiedSeverity"] = 0;
        values[valuesById[1] = "Error"] = 1;
        values[valuesById[2] = "Warning"] = 2;
        values[valuesById[3] = "Information"] = 3;
        values[valuesById[4] = "Hint"] = 4;
        return values;
    })();

    /**
     * DiagnosticTag enum.
     * @name scip.DiagnosticTag
     * @enum {number}
     * @property {number} UnspecifiedDiagnosticTag=0 UnspecifiedDiagnosticTag value
     * @property {number} Unnecessary=1 Unnecessary value
     * @property {number} Deprecated=2 Deprecated value
     */
    scip.DiagnosticTag = (function() {
        const valuesById = $Object.create(null), values = $Object.create(valuesById);
        values[valuesById[0] = "UnspecifiedDiagnosticTag"] = 0;
        values[valuesById[1] = "Unnecessary"] = 1;
        values[valuesById[2] = "Deprecated"] = 2;
        return values;
    })();

    /**
     * Language enum.
     * @name scip.Language
     * @enum {number}
     * @property {number} UnspecifiedLanguage=0 UnspecifiedLanguage value
     * @property {number} ABAP=60 ABAP value
     * @property {number} Apex=96 Apex value
     * @property {number} APL=49 APL value
     * @property {number} Ada=39 Ada value
     * @property {number} Agda=45 Agda value
     * @property {number} AsciiDoc=86 AsciiDoc value
     * @property {number} Assembly=58 Assembly value
     * @property {number} Awk=66 Awk value
     * @property {number} Bat=68 Bat value
     * @property {number} BibTeX=81 BibTeX value
     * @property {number} C=34 C value
     * @property {number} COBOL=59 COBOL value
     * @property {number} CPP=35 CPP value
     * @property {number} CSS=26 CSS value
     * @property {number} CSharp=1 CSharp value
     * @property {number} Clojure=8 Clojure value
     * @property {number} Coffeescript=21 Coffeescript value
     * @property {number} CommonLisp=9 CommonLisp value
     * @property {number} Coq=47 Coq value
     * @property {number} CUDA=97 CUDA value
     * @property {number} Dart=3 Dart value
     * @property {number} Delphi=57 Delphi value
     * @property {number} Diff=88 Diff value
     * @property {number} Dockerfile=80 Dockerfile value
     * @property {number} Dyalog=50 Dyalog value
     * @property {number} Elixir=17 Elixir value
     * @property {number} Erlang=18 Erlang value
     * @property {number} FSharp=42 FSharp value
     * @property {number} Fish=65 Fish value
     * @property {number} Flow=24 Flow value
     * @property {number} Fortran=56 Fortran value
     * @property {number} Git_Commit=91 Git_Commit value
     * @property {number} Git_Config=89 Git_Config value
     * @property {number} Git_Rebase=92 Git_Rebase value
     * @property {number} Go=33 Go value
     * @property {number} GraphQL=98 GraphQL value
     * @property {number} Groovy=7 Groovy value
     * @property {number} HTML=30 HTML value
     * @property {number} Hack=20 Hack value
     * @property {number} Handlebars=90 Handlebars value
     * @property {number} Haskell=44 Haskell value
     * @property {number} Idris=46 Idris value
     * @property {number} Ini=72 Ini value
     * @property {number} J=51 J value
     * @property {number} JSON=75 JSON value
     * @property {number} Java=6 Java value
     * @property {number} JavaScript=22 JavaScript value
     * @property {number} JavaScriptReact=93 JavaScriptReact value
     * @property {number} Jsonnet=76 Jsonnet value
     * @property {number} Julia=55 Julia value
     * @property {number} Justfile=109 Justfile value
     * @property {number} Kotlin=4 Kotlin value
     * @property {number} LaTeX=83 LaTeX value
     * @property {number} Lean=48 Lean value
     * @property {number} Less=27 Less value
     * @property {number} Lua=12 Lua value
     * @property {number} Luau=108 Luau value
     * @property {number} Makefile=79 Makefile value
     * @property {number} Markdown=84 Markdown value
     * @property {number} Matlab=52 Matlab value
     * @property {number} Nickel=110 Nickel value
     * @property {number} Nix=77 Nix value
     * @property {number} OCaml=41 OCaml value
     * @property {number} Objective_C=36 Objective_C value
     * @property {number} Objective_CPP=37 Objective_CPP value
     * @property {number} Odin=111 Odin value
     * @property {number} Pascal=99 Pascal value
     * @property {number} PHP=19 PHP value
     * @property {number} PLSQL=70 PLSQL value
     * @property {number} Perl=13 Perl value
     * @property {number} PowerShell=67 PowerShell value
     * @property {number} Prolog=71 Prolog value
     * @property {number} Protobuf=100 Protobuf value
     * @property {number} Python=15 Python value
     * @property {number} R=54 R value
     * @property {number} Racket=11 Racket value
     * @property {number} Raku=14 Raku value
     * @property {number} Razor=62 Razor value
     * @property {number} Repro=102 Repro value
     * @property {number} ReST=85 ReST value
     * @property {number} Ruby=16 Ruby value
     * @property {number} Rust=40 Rust value
     * @property {number} SAS=61 SAS value
     * @property {number} SCSS=29 SCSS value
     * @property {number} SML=43 SML value
     * @property {number} SQL=69 SQL value
     * @property {number} Sass=28 Sass value
     * @property {number} Scala=5 Scala value
     * @property {number} Scheme=10 Scheme value
     * @property {number} ShellScript=64 ShellScript value
     * @property {number} Skylark=78 Skylark value
     * @property {number} Slang=107 Slang value
     * @property {number} Solidity=95 Solidity value
     * @property {number} Svelte=106 Svelte value
     * @property {number} Swift=2 Swift value
     * @property {number} Tcl=101 Tcl value
     * @property {number} TOML=73 TOML value
     * @property {number} TeX=82 TeX value
     * @property {number} Thrift=103 Thrift value
     * @property {number} TypeScript=23 TypeScript value
     * @property {number} TypeScriptReact=94 TypeScriptReact value
     * @property {number} Verilog=104 Verilog value
     * @property {number} VHDL=105 VHDL value
     * @property {number} VisualBasic=63 VisualBasic value
     * @property {number} Vue=25 Vue value
     * @property {number} Wolfram=53 Wolfram value
     * @property {number} XML=31 XML value
     * @property {number} XSL=32 XSL value
     * @property {number} YAML=74 YAML value
     * @property {number} Zig=38 Zig value
     */
    scip.Language = (function() {
        const valuesById = $Object.create(null), values = $Object.create(valuesById);
        values[valuesById[0] = "UnspecifiedLanguage"] = 0;
        values[valuesById[60] = "ABAP"] = 60;
        values[valuesById[96] = "Apex"] = 96;
        values[valuesById[49] = "APL"] = 49;
        values[valuesById[39] = "Ada"] = 39;
        values[valuesById[45] = "Agda"] = 45;
        values[valuesById[86] = "AsciiDoc"] = 86;
        values[valuesById[58] = "Assembly"] = 58;
        values[valuesById[66] = "Awk"] = 66;
        values[valuesById[68] = "Bat"] = 68;
        values[valuesById[81] = "BibTeX"] = 81;
        values[valuesById[34] = "C"] = 34;
        values[valuesById[59] = "COBOL"] = 59;
        values[valuesById[35] = "CPP"] = 35;
        values[valuesById[26] = "CSS"] = 26;
        values[valuesById[1] = "CSharp"] = 1;
        values[valuesById[8] = "Clojure"] = 8;
        values[valuesById[21] = "Coffeescript"] = 21;
        values[valuesById[9] = "CommonLisp"] = 9;
        values[valuesById[47] = "Coq"] = 47;
        values[valuesById[97] = "CUDA"] = 97;
        values[valuesById[3] = "Dart"] = 3;
        values[valuesById[57] = "Delphi"] = 57;
        values[valuesById[88] = "Diff"] = 88;
        values[valuesById[80] = "Dockerfile"] = 80;
        values[valuesById[50] = "Dyalog"] = 50;
        values[valuesById[17] = "Elixir"] = 17;
        values[valuesById[18] = "Erlang"] = 18;
        values[valuesById[42] = "FSharp"] = 42;
        values[valuesById[65] = "Fish"] = 65;
        values[valuesById[24] = "Flow"] = 24;
        values[valuesById[56] = "Fortran"] = 56;
        values[valuesById[91] = "Git_Commit"] = 91;
        values[valuesById[89] = "Git_Config"] = 89;
        values[valuesById[92] = "Git_Rebase"] = 92;
        values[valuesById[33] = "Go"] = 33;
        values[valuesById[98] = "GraphQL"] = 98;
        values[valuesById[7] = "Groovy"] = 7;
        values[valuesById[30] = "HTML"] = 30;
        values[valuesById[20] = "Hack"] = 20;
        values[valuesById[90] = "Handlebars"] = 90;
        values[valuesById[44] = "Haskell"] = 44;
        values[valuesById[46] = "Idris"] = 46;
        values[valuesById[72] = "Ini"] = 72;
        values[valuesById[51] = "J"] = 51;
        values[valuesById[75] = "JSON"] = 75;
        values[valuesById[6] = "Java"] = 6;
        values[valuesById[22] = "JavaScript"] = 22;
        values[valuesById[93] = "JavaScriptReact"] = 93;
        values[valuesById[76] = "Jsonnet"] = 76;
        values[valuesById[55] = "Julia"] = 55;
        values[valuesById[109] = "Justfile"] = 109;
        values[valuesById[4] = "Kotlin"] = 4;
        values[valuesById[83] = "LaTeX"] = 83;
        values[valuesById[48] = "Lean"] = 48;
        values[valuesById[27] = "Less"] = 27;
        values[valuesById[12] = "Lua"] = 12;
        values[valuesById[108] = "Luau"] = 108;
        values[valuesById[79] = "Makefile"] = 79;
        values[valuesById[84] = "Markdown"] = 84;
        values[valuesById[52] = "Matlab"] = 52;
        values[valuesById[110] = "Nickel"] = 110;
        values[valuesById[77] = "Nix"] = 77;
        values[valuesById[41] = "OCaml"] = 41;
        values[valuesById[36] = "Objective_C"] = 36;
        values[valuesById[37] = "Objective_CPP"] = 37;
        values[valuesById[111] = "Odin"] = 111;
        values[valuesById[99] = "Pascal"] = 99;
        values[valuesById[19] = "PHP"] = 19;
        values[valuesById[70] = "PLSQL"] = 70;
        values[valuesById[13] = "Perl"] = 13;
        values[valuesById[67] = "PowerShell"] = 67;
        values[valuesById[71] = "Prolog"] = 71;
        values[valuesById[100] = "Protobuf"] = 100;
        values[valuesById[15] = "Python"] = 15;
        values[valuesById[54] = "R"] = 54;
        values[valuesById[11] = "Racket"] = 11;
        values[valuesById[14] = "Raku"] = 14;
        values[valuesById[62] = "Razor"] = 62;
        values[valuesById[102] = "Repro"] = 102;
        values[valuesById[85] = "ReST"] = 85;
        values[valuesById[16] = "Ruby"] = 16;
        values[valuesById[40] = "Rust"] = 40;
        values[valuesById[61] = "SAS"] = 61;
        values[valuesById[29] = "SCSS"] = 29;
        values[valuesById[43] = "SML"] = 43;
        values[valuesById[69] = "SQL"] = 69;
        values[valuesById[28] = "Sass"] = 28;
        values[valuesById[5] = "Scala"] = 5;
        values[valuesById[10] = "Scheme"] = 10;
        values[valuesById[64] = "ShellScript"] = 64;
        values[valuesById[78] = "Skylark"] = 78;
        values[valuesById[107] = "Slang"] = 107;
        values[valuesById[95] = "Solidity"] = 95;
        values[valuesById[106] = "Svelte"] = 106;
        values[valuesById[2] = "Swift"] = 2;
        values[valuesById[101] = "Tcl"] = 101;
        values[valuesById[73] = "TOML"] = 73;
        values[valuesById[82] = "TeX"] = 82;
        values[valuesById[103] = "Thrift"] = 103;
        values[valuesById[23] = "TypeScript"] = 23;
        values[valuesById[94] = "TypeScriptReact"] = 94;
        values[valuesById[104] = "Verilog"] = 104;
        values[valuesById[105] = "VHDL"] = 105;
        values[valuesById[63] = "VisualBasic"] = 63;
        values[valuesById[25] = "Vue"] = 25;
        values[valuesById[53] = "Wolfram"] = 53;
        values[valuesById[31] = "XML"] = 31;
        values[valuesById[32] = "XSL"] = 32;
        values[valuesById[74] = "YAML"] = 74;
        values[valuesById[38] = "Zig"] = 38;
        return values;
    })();

    return scip;
})();

export {
  $root as default
};
