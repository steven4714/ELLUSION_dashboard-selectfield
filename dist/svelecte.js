var Svelecte = (function (exports) {
    'use strict';

    function noop() { }
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function is_empty(obj) {
        return Object.keys(obj).length === 0;
    }
    function validate_store(store, name) {
        if (store != null && typeof store.subscribe !== 'function') {
            throw new Error(`'${name}' is not a store with a 'subscribe' method`);
        }
    }
    function subscribe(store, ...callbacks) {
        if (store == null) {
            return noop;
        }
        const unsub = store.subscribe(...callbacks);
        return unsub.unsubscribe ? () => unsub.unsubscribe() : unsub;
    }
    function component_subscribe(component, store, callback) {
        component.$$.on_destroy.push(subscribe(store, callback));
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }
    function null_to_empty(value) {
        return value == null ? '' : value;
    }
    function set_store_value(store, ret, value = ret) {
        store.set(value);
        return ret;
    }
    function action_destroyer(action_result) {
        return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function prevent_default(fn) {
        return function (event) {
            event.preventDefault();
            // @ts-ignore
            return fn.call(this, event);
        };
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    // unfortunately this can't be a constant as that wouldn't be tree-shakeable
    // so we cache the result instead
    let crossorigin;
    function is_crossorigin() {
        if (crossorigin === undefined) {
            crossorigin = false;
            try {
                if (typeof window !== 'undefined' && window.parent) {
                    void window.parent.document;
                }
            }
            catch (error) {
                crossorigin = true;
            }
        }
        return crossorigin;
    }
    function add_resize_listener(node, fn) {
        const computed_style = getComputedStyle(node);
        const z_index = (parseInt(computed_style.zIndex) || 0) - 1;
        if (computed_style.position === 'static') {
            node.style.position = 'relative';
        }
        const iframe = element('iframe');
        iframe.setAttribute('style', `display: block; position: absolute; top: 0; left: 0; width: 100%; height: 100%; ` +
            `overflow: hidden; border: 0; opacity: 0; pointer-events: none; z-index: ${z_index};`);
        iframe.setAttribute('aria-hidden', 'true');
        iframe.tabIndex = -1;
        const crossorigin = is_crossorigin();
        let unsubscribe;
        if (crossorigin) {
            iframe.src = `data:text/html,<script>onresize=function(){parent.postMessage(0,'*')}</script>`;
            unsubscribe = listen(window, 'message', (event) => {
                if (event.source === iframe.contentWindow)
                    fn();
            });
        }
        else {
            iframe.src = 'about:blank';
            iframe.onload = () => {
                unsubscribe = listen(iframe.contentWindow, 'resize', fn);
            };
        }
        append(node, iframe);
        return () => {
            if (crossorigin) {
                unsubscribe();
            }
            else if (unsubscribe && iframe.contentWindow) {
                unsubscribe();
            }
            detach(iframe);
        };
    }
    function toggle_class(element, name, toggle) {
        element.classList[toggle ? 'add' : 'remove'](name);
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }
    class HtmlTag {
        constructor(anchor = null) {
            this.a = anchor;
            this.e = this.n = null;
        }
        m(html, target, anchor = null) {
            if (!this.e) {
                this.e = element(target.nodeName);
                this.t = target;
                this.h(html);
            }
            this.i(anchor);
        }
        h(html) {
            this.e.innerHTML = html;
            this.n = Array.from(this.e.childNodes);
        }
        i(anchor) {
            for (let i = 0; i < this.n.length; i += 1) {
                insert(this.t, this.n[i], anchor);
            }
        }
        p(html) {
            this.d();
            this.h(html);
            this.i(this.a);
        }
        d() {
            this.n.forEach(detach);
        }
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function onDestroy(fn) {
        get_current_component().$$.on_destroy.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }
    function setContext(key, context) {
        get_current_component().$$.context.set(key, context);
    }
    // TODO figure out if we still want to support
    // shorthand events, or if we want to implement
    // a real bubbling mechanism
    function bubble(component, event) {
        const callbacks = component.$$.callbacks[event.type];
        if (callbacks) {
            callbacks.slice().forEach(fn => fn(event));
        }
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function tick() {
        schedule_update();
        return resolved_promise;
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            set_current_component(null);
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }

    const globals = (typeof window !== 'undefined'
        ? window
        : typeof globalThis !== 'undefined'
            ? globalThis
            : global);
    function outro_and_destroy_block(block, lookup) {
        transition_out(block, 1, 1, () => {
            lookup.delete(block.key);
        });
    }
    function update_keyed_each(old_blocks, dirty, get_key, dynamic, ctx, list, lookup, node, destroy, create_each_block, next, get_context) {
        let o = old_blocks.length;
        let n = list.length;
        let i = o;
        const old_indexes = {};
        while (i--)
            old_indexes[old_blocks[i].key] = i;
        const new_blocks = [];
        const new_lookup = new Map();
        const deltas = new Map();
        i = n;
        while (i--) {
            const child_ctx = get_context(ctx, list, i);
            const key = get_key(child_ctx);
            let block = lookup.get(key);
            if (!block) {
                block = create_each_block(key, child_ctx);
                block.c();
            }
            else if (dynamic) {
                block.p(child_ctx, dirty);
            }
            new_lookup.set(key, new_blocks[i] = block);
            if (key in old_indexes)
                deltas.set(key, Math.abs(i - old_indexes[key]));
        }
        const will_move = new Set();
        const did_move = new Set();
        function insert(block) {
            transition_in(block, 1);
            block.m(node, next);
            lookup.set(block.key, block);
            next = block.first;
            n--;
        }
        while (o && n) {
            const new_block = new_blocks[n - 1];
            const old_block = old_blocks[o - 1];
            const new_key = new_block.key;
            const old_key = old_block.key;
            if (new_block === old_block) {
                // do nothing
                next = new_block.first;
                o--;
                n--;
            }
            else if (!new_lookup.has(old_key)) {
                // remove old block
                destroy(old_block, lookup);
                o--;
            }
            else if (!lookup.has(new_key) || will_move.has(new_key)) {
                insert(new_block);
            }
            else if (did_move.has(old_key)) {
                o--;
            }
            else if (deltas.get(new_key) > deltas.get(old_key)) {
                did_move.add(new_key);
                insert(new_block);
            }
            else {
                will_move.add(old_key);
                o--;
            }
        }
        while (o--) {
            const old_block = old_blocks[o];
            if (!new_lookup.has(old_block.key))
                destroy(old_block, lookup);
        }
        while (n)
            insert(new_blocks[n - 1]);
        return new_blocks;
    }
    function validate_each_keys(ctx, list, get_context, get_key) {
        const keys = new Set();
        for (let i = 0; i < list.length; i++) {
            const key = get_key(get_context(ctx, list, i));
            if (keys.has(key)) {
                throw new Error(`Cannot have duplicate keys in a keyed each`);
            }
            keys.add(key);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty,
            skip_bound: false
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if (!$$.skip_bound && $$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set($$props) {
            if (this.$$set && !is_empty($$props)) {
                this.$$.skip_bound = true;
                this.$$set($$props);
                this.$$.skip_bound = false;
            }
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.25.0' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function prop_dev(node, property, value) {
        node[property] = value;
        dispatch_dev("SvelteDOMSetProperty", { node, property, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    /**
     * sifter.js
     * Copyright (c) 2013–2020 Brian Reavis & contributors
     *
     * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this
     * file except in compliance with the License. You may obtain a copy of the License at:
     * http://www.apache.org/licenses/LICENSE-2.0
     *
     * Unless required by applicable law or agreed to in writing, software distributed under
     * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF
     * ANY KIND, either express or implied. See the License for the specific language
     * governing permissions and limitations under the License.
     *
     * @author Brian Reavis <brian@thirdroute.com>
     */

    /**
     * Textually searches arrays and hashes of objects
     * by property (or multiple properties). Designed
     * specifically for autocomplete.
     *
     * @constructor
     * @param {array|object} items
     * @param {object} items
     */
    var Sifter = function(items, settings) {
        this.items = items;
        this.settings = settings || {diacritics: true};
    };

    /**
     * Splits a search string into an array of individual
     * regexps to be used to match results.
     *
     * @param {string} query
     * @returns {array}
     */
    Sifter.prototype.tokenize = function(query, respect_word_boundaries) {
        query = trim(String(query || '').toLowerCase());
        if (!query || !query.length) return [];

        var i, n, regex, letter;
        var tokens = [];
        var words = query.split(/ +/);

        for (i = 0, n = words.length; i < n; i++) {
            regex = escape_regex(words[i]);
            if (this.settings.diacritics) {
                for (letter in DIACRITICS) {
                    if (DIACRITICS.hasOwnProperty(letter)) {
                        regex = regex.replace(new RegExp(letter, 'g'), DIACRITICS[letter]);
                    }
                }
            }
            if (respect_word_boundaries) regex = "\\b"+regex;
            tokens.push({
                string : words[i],
                regex  : new RegExp(regex, 'i')
            });
        }

        return tokens;
    };

    /**
     * Iterates over arrays and hashes.
     *
     * ```
     * this.iterator(this.items, function(item, id) {
     *    // invoked for each item
     * });
     * ```
     *
     * @param {array|object} object
     */
    Sifter.prototype.iterator = function(object, callback) {
        var iterator;
        if (Array.isArray(object)) {
            iterator = Array.prototype.forEach || function(callback) {
                for (var i = 0, n = this.length; i < n; i++) {
                    callback(this[i], i, this);
                }
            };
        } else {
            iterator = function(callback) {
                for (var key in this) {
                    if (this.hasOwnProperty(key)) {
                        callback(this[key], key, this);
                    }
                }
            };
        }

        iterator.apply(object, [callback]);
    };

    /**
     * Returns a function to be used to score individual results.
     *
     * Good matches will have a higher score than poor matches.
     * If an item is not a match, 0 will be returned by the function.
     *
     * @param {object|string} search
     * @param {object} options (optional)
     * @returns {function}
     */
    Sifter.prototype.getScoreFunction = function(search, options) {
        var self, fields, tokens, token_count, nesting;

        self        = this;
        search      = self.prepareSearch(search, options);
        tokens      = search.tokens;
        fields      = search.options.fields;
        token_count = tokens.length;
        nesting     = search.options.nesting;

        /**
         * Calculates how close of a match the
         * given value is against a search token.
         *
         * @param {string | number} value
         * @param {object} token
         * @return {number}
         */
        var scoreValue = function(value, token) {
            var score, pos;

            if (!value) return 0;
            value = String(value || '');
            pos = value.search(token.regex);
            if (pos === -1) return 0;
            score = token.string.length / value.length;
            if (pos === 0) score += 0.5;
            return score;
        };

        /**
         * Calculates the score of an object
         * against the search query.
         *
         * @param {object} token
         * @param {object} data
         * @return {number}
         */
        var scoreObject = (function() {
            var field_count = fields.length;
            if (!field_count) {
                return function() { return 0; };
            }
            if (field_count === 1) {
                return function(token, data) {
                    return scoreValue(getattr(data, fields[0], nesting), token);
                };
            }
            return function(token, data) {
                for (var i = 0, sum = 0; i < field_count; i++) {
                    sum += scoreValue(getattr(data, fields[i], nesting), token);
                }
                return sum / field_count;
            };
        })();

        if (!token_count) {
            return function() { return 0; };
        }
        if (token_count === 1) {
            return function(data) {
                return scoreObject(tokens[0], data);
            };
        }

        if (search.options.conjunction === 'and') {
            return function(data) {
                var score;
                for (var i = 0, sum = 0; i < token_count; i++) {
                    score = scoreObject(tokens[i], data);
                    if (score <= 0) return 0;
                    sum += score;
                }
                return sum / token_count;
            };
        } else {
            return function(data) {
                for (var i = 0, sum = 0; i < token_count; i++) {
                    sum += scoreObject(tokens[i], data);
                }
                return sum / token_count;
            };
        }
    };

    /**
     * Returns a function that can be used to compare two
     * results, for sorting purposes. If no sorting should
     * be performed, `null` will be returned.
     *
     * @param {string|object} search
     * @param {object} options
     * @return function(a,b)
     */
    Sifter.prototype.getSortFunction = function(search, options) {
        var i, n, self, field, fields, fields_count, multiplier, multipliers, get_field, implicit_score, sort;

        self   = this;
        search = self.prepareSearch(search, options);
        sort   = (!search.query && options.sort_empty) || options.sort;

        /**
         * Fetches the specified sort field value
         * from a search result item.
         *
         * @param  {string} name
         * @param  {object} result
         */
        get_field = function(name, result) {
            if (name === '$score') return result.score;
            return getattr(self.items[result.id], name, options.nesting);
        };

        // parse options
        fields = [];
        if (sort) {
            for (i = 0, n = sort.length; i < n; i++) {
                if (search.query || sort[i].field !== '$score') {
                    fields.push(sort[i]);
                }
            }
        }

        // the "$score" field is implied to be the primary
        // sort field, unless it's manually specified
        if (search.query) {
            implicit_score = true;
            for (i = 0, n = fields.length; i < n; i++) {
                if (fields[i].field === '$score') {
                    implicit_score = false;
                    break;
                }
            }
            if (implicit_score) {
                fields.unshift({field: '$score', direction: 'desc'});
            }
        } else {
            for (i = 0, n = fields.length; i < n; i++) {
                if (fields[i].field === '$score') {
                    fields.splice(i, 1);
                    break;
                }
            }
        }

        multipliers = [];
        for (i = 0, n = fields.length; i < n; i++) {
            multipliers.push(fields[i].direction === 'desc' ? -1 : 1);
        }

        // build function
        fields_count = fields.length;
        if (!fields_count) {
            return null;
        } else if (fields_count === 1) {
            field = fields[0].field;
            multiplier = multipliers[0];
            return function(a, b) {
                return multiplier * cmp(
                    get_field(field, a),
                    get_field(field, b)
                );
            };
        } else {
            return function(a, b) {
                var i, result, field;
                for (i = 0; i < fields_count; i++) {
                    field = fields[i].field;
                    result = multipliers[i] * cmp(
                        get_field(field, a),
                        get_field(field, b)
                    );
                    if (result) return result;
                }
                return 0;
            };
        }
    };

    /**
     * Parses a search query and returns an object
     * with tokens and fields ready to be populated
     * with results.
     *
     * @param {string} query
     * @param {object} options
     * @returns {object}
     */
    Sifter.prototype.prepareSearch = function(query, options) {
        if (typeof query === 'object') return query;

        options = extend({}, options);

        var option_fields     = options.fields;
        var option_sort       = options.sort;
        var option_sort_empty = options.sort_empty;

        if (option_fields && !Array.isArray(option_fields)) options.fields = [option_fields];
        if (option_sort && !Array.isArray(option_sort)) options.sort = [option_sort];
        if (option_sort_empty && !Array.isArray(option_sort_empty)) options.sort_empty = [option_sort_empty];

        return {
            options : options,
            query   : String(query || '').toLowerCase(),
            tokens  : this.tokenize(query, options.respect_word_boundaries),
            total   : 0,
            items   : []
        };
    };

    /**
     * Searches through all items and returns a sorted array of matches.
     *
     * The `options` parameter can contain:
     *
     *   - fields {string|array}
     *   - sort {array}
     *   - score {function}
     *   - filter {bool}
     *   - limit {integer}
     *
     * Returns an object containing:
     *
     *   - options {object}
     *   - query {string}
     *   - tokens {array}
     *   - total {int}
     *   - items {array}
     *
     * @param {string} query
     * @param {object} options
     * @returns {object}
     */
    Sifter.prototype.search = function(query, options) {
        var self = this, score, search;
        var fn_sort;
        var fn_score;

        search  = this.prepareSearch(query, options);
        options = search.options;
        query   = search.query;

        // generate result scoring function
        fn_score = options.score || self.getScoreFunction(search);

        // perform search and sort
        if (query.length) {
            self.iterator(self.items, function(item, id) {
                score = fn_score(item);
                if (options.filter === false || score > 0) {
                    search.items.push({'score': score, 'id': id});
                }
            });
        } else {
            self.iterator(self.items, function(item, id) {
                search.items.push({'score': 1, 'id': id});
            });
        }

        fn_sort = self.getSortFunction(search, options);
        if (fn_sort) search.items.sort(fn_sort);

        // apply limits
        search.total = search.items.length;
        if (typeof options.limit === 'number') {
            search.items = search.items.slice(0, options.limit);
        }

        return search;
    };

    // utilities
    // - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    var cmp = function(a, b) {
        if (typeof a === 'number' && typeof b === 'number') {
            return a > b ? 1 : (a < b ? -1 : 0);
        }
        a = asciifold(String(a || ''));
        b = asciifold(String(b || ''));
        if (a > b) return 1;
        if (b > a) return -1;
        return 0;
    };

    var extend = function(a, b) {
        var i, n, k, object;
        for (i = 1, n = arguments.length; i < n; i++) {
            object = arguments[i];
            if (!object) continue;
            for (k in object) {
                if (object.hasOwnProperty(k)) {
                    a[k] = object[k];
                }
            }
        }
        return a;
    };

    /**
     * A property getter resolving dot-notation
     * @param  {Object}  obj     The root object to fetch property on
     * @param  {String}  name    The optionally dotted property name to fetch
     * @param  {Boolean} nesting Handle nesting or not
     * @return {Object}          The resolved property value
     */
    var getattr = function(obj, name, nesting) {
        if (!obj || !name) return;
        if (!nesting) return obj[name];
        var names = name.split(".");
        while(names.length && (obj = obj[names.shift()]));
        return obj;
    };

    var trim = function(str) {
        return (str + '').replace(/^\s+|\s+$|/g, '');
    };

    var escape_regex = function(str) {
        return (str + '').replace(/([.?*+^$[\]\\(){}|-])/g, '\\$1');
    };

    var DIACRITICS = {
        'a': '[aḀḁĂăÂâǍǎȺⱥȦȧẠạÄäÀàÁáĀāÃãÅåąĄÃąĄ]',
        'b': '[b␢βΒB฿𐌁ᛒ]',
        'c': '[cĆćĈĉČčĊċC̄c̄ÇçḈḉȻȼƇƈɕᴄＣｃ]',
        'd': '[dĎďḊḋḐḑḌḍḒḓḎḏĐđD̦d̦ƉɖƊɗƋƌᵭᶁᶑȡᴅＤｄð]',
        'e': '[eÉéÈèÊêḘḙĚěĔĕẼẽḚḛẺẻĖėËëĒēȨȩĘęᶒɆɇȄȅẾếỀềỄễỂểḜḝḖḗḔḕȆȇẸẹỆệⱸᴇＥｅɘǝƏƐε]',
        'f': '[fƑƒḞḟ]',
        'g': '[gɢ₲ǤǥĜĝĞğĢģƓɠĠġ]',
        'h': '[hĤĥĦħḨḩẖẖḤḥḢḣɦʰǶƕ]',
        'i': '[iÍíÌìĬĭÎîǏǐÏïḮḯĨĩĮįĪīỈỉȈȉȊȋỊịḬḭƗɨɨ̆ᵻᶖİiIıɪＩｉ]',
        'j': '[jȷĴĵɈɉʝɟʲ]',
        'k': '[kƘƙꝀꝁḰḱǨǩḲḳḴḵκϰ₭]',
        'l': '[lŁłĽľĻļĹĺḶḷḸḹḼḽḺḻĿŀȽƚⱠⱡⱢɫɬᶅɭȴʟＬｌ]',
        'n': '[nŃńǸǹŇňÑñṄṅŅņṆṇṊṋṈṉN̈n̈ƝɲȠƞᵰᶇɳȵɴＮｎŊŋ]',
        'o': '[oØøÖöÓóÒòÔôǑǒŐőŎŏȮȯỌọƟɵƠơỎỏŌōÕõǪǫȌȍՕօ]',
        'p': '[pṔṕṖṗⱣᵽƤƥᵱ]',
        'q': '[qꝖꝗʠɊɋꝘꝙq̃]',
        'r': '[rŔŕɌɍŘřŖŗṘṙȐȑȒȓṚṛⱤɽ]',
        's': '[sŚśṠṡṢṣꞨꞩŜŝŠšŞşȘșS̈s̈]',
        't': '[tŤťṪṫŢţṬṭƮʈȚțṰṱṮṯƬƭ]',
        'u': '[uŬŭɄʉỤụÜüÚúÙùÛûǓǔŰűŬŭƯưỦủŪūŨũŲųȔȕ∪]',
        'v': '[vṼṽṾṿƲʋꝞꝟⱱʋ]',
        'w': '[wẂẃẀẁŴŵẄẅẆẇẈẉ]',
        'x': '[xẌẍẊẋχ]',
        'y': '[yÝýỲỳŶŷŸÿỸỹẎẏỴỵɎɏƳƴ]',
        'z': '[zŹźẐẑŽžŻżẒẓẔẕƵƶ]'
    };

    const asciifold = (function() {
        var i, n, k, chunk;
        var foreignletters = '';
        var lookup = {};
        for (k in DIACRITICS) {
            if (DIACRITICS.hasOwnProperty(k)) {
                chunk = DIACRITICS[k].substring(2, DIACRITICS[k].length - 1);
                foreignletters += chunk;
                for (i = 0, n = chunk.length; i < n; i++) {
                    lookup[chunk.charAt(i)] = k;
                }
            }
        }
        var regexp = new RegExp('[' +  foreignletters + ']', 'g');
        return function(str) {
            return str.replace(regexp, function(foreignletter) {
                return lookup[foreignletter];
            }).toLowerCase();
        };
    })();

    // source: https://github.com/rob-balfre/svelte-select/blob/master/src/utils/isOutOfViewport.js
    function isOutOfViewport(elem) {
      const bounding = elem.getBoundingClientRect();
      const out = {};

      out.top = bounding.top < 0 || bounding.top - bounding.height < 0;
      out.left = bounding.left < 0;
      out.bottom = bounding.bottom > (window.innerHeight || document.documentElement.clientHeight);
      out.right = bounding.right > (window.innerWidth || document.documentElement.clientWidth);
      out.any = out.top || out.left || out.bottom || out.right;

      return out;
    }
    let xhr = null;

    function fetchRemote(url) {
      return function(query, cb) {
        return new Promise((resolve, reject) => {
          xhr = new XMLHttpRequest();
          xhr.open('GET', `${url.replace('[query]', encodeURIComponent(query))}`);
          xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
          xhr.send();
          
          xhr.onreadystatechange = () => {
            if (xhr.readyState === 4) {
              if (xhr.status === 200) {
                const resp = JSON.parse(xhr.response);
                resolve(cb ? cb(resp) : resp.data || resp.items || resp.options || resp);
              } else {
                reject();
              }
            } 
          };
        });
      }
    }

    let timeout;
    function debounce(fn, delay) {
    	return function() {
    		const self = this;
    		const args = arguments;
    		clearTimeout(timeout);
    		timeout = setTimeout(function() {
          fn.apply(self, args);
    		}, delay);
    	};
    }
    /**
     * highlight-related code from selectize itself. We pass raw html through @html svelte tag
     * base from https://github.com/selectize/selectize.js/blob/master/src/contrib/highlight.js & edited
     */
    const itemHtml = document.createElement('div');
    itemHtml.className = 'sv-item-content';

    function highlightSearch(item, isSelected, $inputValue, formatter) {
      itemHtml.innerHTML = formatter ? formatter(item, isSelected) : item;
      if ($inputValue == '' || item.isSelected) return itemHtml.outerHTML;

      const regex = new RegExp(`(${asciifold($inputValue)})`, 'ig');
      
      highlight(itemHtml, regex);

      return itemHtml.outerHTML;
    }

    const highlight = function(node, regex) {
      let skip = 0;
      // Wrap matching part of text node with highlighting <span>, e.g.
      // Soccer  ->  <span class="highlight">Soc</span>cer  for regex = /soc/i
      if (node.nodeType === 3) {
        const folded = asciifold(node.data);
        const pos = folded.search(regex);
        // var pos = node.data.search(regex);
        if (pos >= 0 && node.data.length > 0) {
          const match = folded.match(regex);
          // var match = node.data.match(regex);
          const spannode = document.createElement('span');
          spannode.className = 'highlight';
          const middlebit = node.splitText(pos);
          const endbit = middlebit.splitText(match[0].length);
          const middleclone = middlebit.cloneNode(true);
          spannode.appendChild(middleclone);
          middlebit.parentNode.replaceChild(spannode, middlebit);
          skip = 1;
        }
      } 
      // Recurse element node, looking for child text nodes to highlight, unless element 
      // is childless, <script>, <style>, or already highlighted: <span class="hightlight">
      else if (node.nodeType === 1 && node.childNodes && !/(script|style)/i.test(node.tagName) && ( node.className !== 'highlight' || node.tagName !== 'SPAN' )) {
        for (var i = 0; i < node.childNodes.length; ++i) {
          i += highlight(node.childNodes[i], regex);
        }
      }
      return skip;
    };

    /**
     * Automatic setter for 'valueField' or 'labelField' when they are not set
     */
    function fieldInit(type, options) {
      const isValue = type === 'value';
      let val = isValue  ? 'value' : 'text';              // selectize style defaults
      if (options && options.length) {
        const firstItem = options[0].options ? options[0].options[0] : options[0];
        const autoAddItem = isValue ? 0 : 1;
        const guessList = isValue
          ? ['id', 'value', 'ID']
          : ['name', 'title', 'label'];
        val = Object.keys(firstItem).filter(prop => guessList.includes(prop))
          .concat([Object.keys(firstItem)[autoAddItem]])  // auto add field (used as fallback)
          .shift();  
      }
      return val;
    }

    const settings = {

      /** ************************************ sub-component props */
      /* HTML related */
      name: null, // if name is defined, <select> element is created as well
      
      required: false,
      multiple: false,
      searchable: true,
      disabled: false,
      creatable: false,
      creatablePrefix: '*',
      clearable: false,
      selectOnTab: false,
      placeholder: 'Select',
      valueField: null,
      labelField: null,
      max: 0,
      delimiter: ',',
      sortRemoteResults: true,
      virtualList: false,
      vlItemSize: null,
      vlHeight: null,
      // enable collapsible multiple selection
      collapseSelection: false, 
      i18n: {
        empty: 'No options',
        nomatch: 'No matching options',    
        max: num => `Maximum items ${num} selected`,
        fetchBefore: 'Type to search',
        fetchEmpty: 'No data related to your search',
        collapsedSelection: count => {
          // example of plural collapse
          // switch (count) {
          //   case 1: return '1 selected';
          // }
          return `${count} selected`;
        }
      }
    };

    const subscriber_queue = [];
    /**
     * Creates a `Readable` store that allows reading by subscription.
     * @param value initial value
     * @param {StartStopNotifier}start start and stop notifications for subscriptions
     */
    function readable(value, start) {
        return {
            subscribe: writable(value, start).subscribe
        };
    }
    /**
     * Create a `Writable` store that allows both updating and reading by subscription.
     * @param {*=}value initial value
     * @param {StartStopNotifier=}start start and stop notifications for subscriptions
     */
    function writable(value, start = noop) {
        let stop;
        const subscribers = [];
        function set(new_value) {
            if (safe_not_equal(value, new_value)) {
                value = new_value;
                if (stop) { // store is ready
                    const run_queue = !subscriber_queue.length;
                    for (let i = 0; i < subscribers.length; i += 1) {
                        const s = subscribers[i];
                        s[1]();
                        subscriber_queue.push(s, value);
                    }
                    if (run_queue) {
                        for (let i = 0; i < subscriber_queue.length; i += 2) {
                            subscriber_queue[i][0](subscriber_queue[i + 1]);
                        }
                        subscriber_queue.length = 0;
                    }
                }
            }
        }
        function update(fn) {
            set(fn(value));
        }
        function subscribe(run, invalidate = noop) {
            const subscriber = [run, invalidate];
            subscribers.push(subscriber);
            if (subscribers.length === 1) {
                stop = start(set) || noop;
            }
            run(value);
            return () => {
                const index = subscribers.indexOf(subscriber);
                if (index !== -1) {
                    subscribers.splice(index, 1);
                }
                if (subscribers.length === 0) {
                    stop();
                    stop = null;
                }
            };
        }
        return { set, update, subscribe };
    }
    function derived(stores, fn, initial_value) {
        const single = !Array.isArray(stores);
        const stores_array = single
            ? [stores]
            : stores;
        const auto = fn.length < 2;
        return readable(initial_value, (set) => {
            let inited = false;
            const values = [];
            let pending = 0;
            let cleanup = noop;
            const sync = () => {
                if (pending) {
                    return;
                }
                cleanup();
                const result = fn(single ? values[0] : values, set);
                if (auto) {
                    set(result);
                }
                else {
                    cleanup = is_function(result) ? result : noop;
                }
            };
            const unsubscribers = stores_array.map((store, i) => subscribe(store, (value) => {
                values[i] = value;
                pending &= ~(1 << i);
                if (inited) {
                    sync();
                }
            }, () => {
                pending |= (1 << i);
            }));
            inited = true;
            sync();
            return function stop() {
                run_all(unsubscribers);
                cleanup();
            };
        });
    }

    // import { onDestroy } from 'svelte';
    // import { debounce, xhr } from './lib/utils';

    const key = {};

    function getFilterProps(object) {
      if (object.options) object = object.options[0];
      const exclude = ['value', 'isSelected', 'isDisabled' ,'selected', 'disabled'];
      return Object.keys(object).filter(prop => !exclude.includes(prop));
    }

    function setToggleHelper(o) {
      if (this.has(o)) {
        !o.isSelected && this.delete(o);
        return false;
      }
      o.isSelected && this.add(o);
      return true;
    }

    const initStore = (options, selection, initialSettings, dropdownMessages) => {
      const internalSelection = new Set();
      const selectionToggle = setToggleHelper.bind(internalSelection);

      let valueField = initialSettings.currentValueField;
      let labelField = initialSettings.currentLabelField;
      let maxItems = initialSettings.max;
      let isMultiple = initialSettings.multiple;
      let isCreatable = initialSettings.creatable;
      let searchField = initialSettings.searchField;
      let sortField = initialSettings.sortField;
      let optionsWithGroups = false;
      let sifterSearchField = initialSettings.searchField;
      let sifterSortField = initialSettings.sortField;
      let sifterSortRemote = initialSettings.sortRemote ? true : false;

      const settings = initSettings(initialSettings);

      const settingsUnsubscribe = settings.subscribe(val => {
        maxItems = val.max;
        isMultiple = val.multiple;
        isCreatable = val.creatable;
        sifterSortRemote = val.sortRemote;
        valueField = val.currentValueField;
        labelField = val.currentLabelField;
        if (!isMultiple && internalSelection.size > 1) {
          opts.update(opts => opts.map(o => { o.isSelected = false; return o }));
        }
        if (isMultiple && maxItems && internalSelection.size > maxItems) {
          let i = 0;
          const reset = o => { 
            if (o.isSelected) {
              if (i >= maxItems) o.isSelected = false;
              i++;
            }
            return o;
          };
          opts.update(opts => opts.map(reset));
        }
        if (val.searchField && searchField !== val.searchField) {
          searchField = val.searchField;
        }
        if (val.sortField && sortField !== val.sortField) {
          sortField = val.sortField;
        }
      });
      
      const inputValue = writable('');
      const isFetchingData = writable(false);
      const hasFocus = writable(false);
      const hasDropdownOpened = writable(false);
      const listMessage = writable(dropdownMessages.empty);
      const opts = writable([]);
      let _flatOptions = []; // for performance gain, set manually in 'updateOpts'
      const updateOpts = (options) => {
        optionsWithGroups = options.some(opt => opt.options);
        
        {
          sifterSearchField = searchField || getFilterProps(options.length > 0 ? options[0] : { [labelField]: ''});
          sifterSortField = searchField || (
            optionsWithGroups
              ? false
              : (sortField || [{ field: labelField, direction: 'asc'}])
          );
        }

        _flatOptions = options.reduce((res, opt) => {
          if (opt.options) {
            res.push(...opt.options);
            return res;
          }
          res.push(opt);
          return res;
        }, []);
        opts.set(options);
        // init selection
        options.forEach(opt => opt.isSelected && internalSelection.add(opt));
      };
      
      updateOpts(options);  // init options

      
      /***************************************************************/
      /**                    options exposed API                     */
      /***************************************************************/

      const selectOption = option => {
        if (maxItems && internalSelection.size === maxItems) return;
        opts.update(list => {
          if (!isMultiple) {
            internalSelection.forEach(opt => {
              opt.isSelected = false;
              // isCreatable && opt._created && list.splice(list.indexOf(opt), 1);
            });
          }
          if (typeof option === 'string') {
            option = {
              [labelField]: `*${option}`,
              [valueField]: encodeURIComponent(option),
              isSelected: true,
              _created: true,
            };
            list.push(option);
          } else {
            const searchedValue = option[valueField];
            list.some(opt => {
              if (opt.options) {
                return opt.options.some(groupOpt => {
                  if (groupOpt[valueField] == searchedValue) {
                    groupOpt.isSelected = true;
                    return true;
                  }
                  return false;
                });
              } else {
                if (opt[valueField] == searchedValue) {
                  opt.isSelected = true;
                  return true;
                }
                return false;
              }
            });
          }
          return list;
        });
      };
      const deselectOption = option => opts.update(list => {
        internalSelection.delete(option);
        option.isSelected = false;
        // if (option._created) {
        //   list.splice(list.indexOf(option), 1);
        // } 
        return list;
      });
      const clearSelection = () => opts.update(list => {
        const toClear = [];
        list.forEach(opt => {
          if (opt.options) {
            opt.options.forEach(o => o.isSelected = false);
          } else {
            opt.isSelected = false;
            if (opt._created) {
              internalSelection.delete(opt);
              // toClear.push(list.indexOf(opt));
            }
          }
        });
        toClear.length && toClear.reverse().forEach(idx => list.splice(idx, 1));
        return list;
      });

      // init selections
      selection &&  (Array.isArray(selection) ? selection : [selection]).forEach(selectOption);

      /** ************************************ filtered results */
      const matchingOptions = derived([opts, inputValue, settings], 
        ([$opts, $inputValue, $settings], set) => {
          // set dropdown list empty when max is reached
          if ($settings.max && internalSelection.size === $settings.max) {
            listMessage.set(dropdownMessages.max.replace(':maxItems', $settings.max));
            set([]);
            return;
          }
          if ($inputValue === '' || !sifterSortRemote) {
            return $settings.multiple
              ? set($opts.reduce((res, opt) => {
                if (opt.options) {
                  if (!opt.isDisabled) {
                    const filteredOpts = opt.options.filter(o => !o.isSelected);
                    if (filteredOpts.length) {
                      res.push({
                        label: opt.label,
                        options: filteredOpts
                      });
                    }
                  }
                } else {
                  !opt.isSelected && res.push(opt);
                }
                return res;
              }, []))
              : set($opts);
          }
          /**
           * Sifter is used for searching to provide rich filter functionality.
           * But it degradate nicely, when optgroups are present
           */
          const sifter = new Sifter(_flatOptions);
          if (optionsWithGroups) {  // disable sorting 
            sifter.getSortFunction = () => null;
          }
          const result = sifter.search($inputValue, {
            fields: sifterSearchField,
            sort: sifterSortField,
            conjunction: 'and'
          });
          let mapped = result.items.map(item => _flatOptions[item.id]);
          if (optionsWithGroups) {
            let _s = mapped.shift();
            mapped = $opts.reduce((res, opt) => {
              if (opt === _s && !opt.isSelected) {
                _s = mapped.shift();
                res.push(opt);
              }
              if (opt.options) {
                const subopts = [];
                opt.options.forEach(o => {
                  if (o === _s && !o.isSelected) {
                    subopts.push(o);
                    _s = mapped.shift();
                  }
                });
                subopts.length && res.push({ label: opt.label, options: subopts });
              }
              return res;
            }, []);
          }
          set(mapped.filter(item => !item.isSelected));
        }
      );

      const listIndexMap = derived(matchingOptions, ($matchingOptions, set) => {
        let base = 0;
        let groupIndex = 0;
        let offset = 0;
        set(
          $matchingOptions.reduce((res, opt, idx) => {
            if (opt.options) {  // optGroup
              if (opt.isDisabled) { 
                res.push('');
                return res;
              }
              res.push(opt.options.map(o => {
                if (o.isDisabled) return '';       
                return offset++ + groupIndex;
              }));
              return res;
            }
            groupIndex++;
            if (opt.isDisabled) {
              res.push(''); 
              return res;
            }
            res.push(offset + base++); // increment
            return res;
          }, [])
        );
      });

      /** ************************************ for keyboard navigation even through opt-groups */
      const flatMatching = !optionsWithGroups
        ? matchingOptions
        : derived([matchingOptions, inputValue, settings], ([$matchingOptions, $inputValue, $settings], set) => {
        const flatList = $inputValue !== ''
          ? $matchingOptions.reduce((res, opt) => {
              if (opt.options) {
                res.push(...opt.options);
                return res;
              }
              res.push(opt);
              return res;
            }, [])
          : ($settings.multiple ? _flatOptions.filter(o => !o.isSelected) : _flatOptions);
        set(flatList.filter(o => !o.isDisabled));
      });

      /** ************************************ selection set */
      const selectedOptions = derived([opts, settings], ([$opts, $settings], set) => {
        if (!$settings.multiple) internalSelection.clear();
        $opts.forEach(o => {
          if (o.options) {
            !o.isDisabled && o.options.forEach(selectionToggle);
            return;
          }
          selectionToggle(o);
        });
        set(Array.from(internalSelection));
      }, Array.from(internalSelection));

      const listLength = derived(opts, ($opts, set) => {
        set(
          $opts.reduce((res, opt) => {
            res += opt.options ? opt.options.length : 1;
            return res;
          }, 0)
        );
      });
      const currentListLength = derived([inputValue, flatMatching], ([$inputValue, $flatMatching], set) => {
        set(isCreatable && $inputValue ? $flatMatching.length : $flatMatching.length - 1);
      });

      return {
        /** context stores */
        hasFocus,
        hasDropdownOpened,
        inputValue,
        isFetchingData,
        listMessage,
        settings,
        /** options:actions **/
        selectOption,
        deselectOption,
        clearSelection,
        settingsUnsubscribe,
        /** options:getters **/
        listLength,
        listIndexMap,
        matchingOptions,
        flatMatching,
        currentListLength,
        selectedOptions,
        /** options: update */
        updateOpts
      }
    };

    const initSettings = (initialSettings) => {
      const settings = writable(initialSettings || {});
      settings.updateOne = (name, value) => {
        settings.update(_val => {
          _val[name] = value;
          return _val;
        });
      };
      return settings;
    };

    let sifter = null;
    let optionsWithGroups = false;
    let indexMapping = {
      map: [],
      first: null,
      last: null,
      next(curr) {
        const val = this.map[++curr];
        if (val === '') return this.next(curr);
        if (!val) return this.first;
        return val;
      },
      prev(curr) {
        const val = this.map[--curr];
        if (val === '') return this.prev(curr);
        if (!val) return this.last;
        return val;
      }
    };

    // TODO: implement customization of this
    let sifterSearchField = ['text'];
    let sifterSortField = [{ field: 'text', direction: 'asc'}];

    function flatList(options) {
      const flatOpts = options.reduce((res, opt) => {
        if (opt.options && opt.options.length) {
          optionsWithGroups = true;
          res.push({ label: opt.label, $isGroupHeader: true });
          res.push(...opt.options.map(_opt => {
            _opt.$isGroupItem = true;
            return _opt;
          }));
          return res;
        }
        res.push(opt);
        return res;
      }, []);
      sifter = new Sifter(flatOpts);
      return flatOpts;
    }

    function filterList(options, inputValue, excludeSelected) {
      if (!inputValue) {
        if (excludeSelected) {
          return options
            .filter(opt => !opt.isSelected)
            .filter((opt, idx, self) => {
              // TODO: issue #4
              if (opt.$isGroupHeader && ((self[idx + 1] && self[idx + 1].$isGroupHeader) || idx ===0)) return false;
              return true;
            })
        }
        return options;
      }
      /**
       * Sifter is used for searching to provide rich filter functionality.
       * But it degradate nicely, when optgroups are present
      */
      if (optionsWithGroups) {  // disable sorting 
        sifter.getSortFunction = () => null;
      }
      const result = sifter.search(inputValue, {
        fields: sifterSearchField,
        sort: sifterSortField,
        conjunction: 'and'
      });
      const mapped = optionsWithGroups
        ? result.items.reduce((res, item) => {
            const opt = options[item.id]; 
            if (excludeSelected && opt.isSelected) return res;
            const lastPos = res.push(opt);
            if (opt.$isGroupItem) {
              const prevItems = options.slice(0, item.id);
              let prev = null;
              do {
                prev = prevItems.pop();
                prev && prev.$isGroupHeader && !res.includes(prev) && res.splice(lastPos - 1, 0, prev);
              } while (prev && !prev.$isGroupHeader);
            }
            return res;
          }, [])
        : result.items.mapped(item => options[item.id]);
      return mapped;
    }

    function indexList(options) {
      const map = optionsWithGroups
        ? options.reduce((res, opt, index) => {
          res.push(opt.$isGroupHeader ? '' : index);
          return res;
        }, [])
        : Object.keys(options);
      indexMapping.map = map;
      indexMapping.first = map[0] !== '' ? 0 : 1;
      indexMapping.last = map.length - 1;
      return indexMapping;
    }

    /* src\Svelecte\components\Input.svelte generated by Svelte v3.25.0 */
    const file = "src\\Svelecte\\components\\Input.svelte";

    function create_fragment(ctx) {
    	let input;
    	let input_readonly_value;
    	let t0;
    	let div;
    	let t1;
    	let div_resize_listener;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			input = element("input");
    			t0 = space();
    			div = element("div");
    			t1 = text(/*shadowText*/ ctx[7]);
    			attr_dev(input, "type", "text");
    			attr_dev(input, "class", "inputBox svelte-mtw92l");
    			input.disabled = /*disabled*/ ctx[1];
    			input.readOnly = input_readonly_value = !/*searchable*/ ctx[0];
    			attr_dev(input, "style", /*inputStyle*/ ctx[9]);
    			attr_dev(input, "placeholder", /*placeholderText*/ ctx[6]);
    			add_location(input, file, 42, 0, 1271);
    			attr_dev(div, "class", "shadow-text svelte-mtw92l");
    			add_render_callback(() => /*div_elementresize_handler*/ ctx[21].call(div));
    			add_location(div, file, 54, 0, 1549);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, input, anchor);
    			/*input_binding*/ ctx[19](input);
    			set_input_value(input, /*$inputValue*/ ctx[8]);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, div, anchor);
    			append_dev(div, t1);
    			div_resize_listener = add_resize_listener(div, /*div_elementresize_handler*/ ctx[21].bind(div));

    			if (!mounted) {
    				dispose = [
    					listen_dev(input, "input", /*input_input_handler*/ ctx[20]),
    					listen_dev(input, "focus", /*focus_handler*/ ctx[16], false, false, false),
    					listen_dev(input, "blur", /*blur_handler*/ ctx[17], false, false, false),
    					listen_dev(input, "keydown", /*onKeyDown*/ ctx[10], false, false, false),
    					listen_dev(input, "keyup", /*onKeyUp*/ ctx[11], false, false, false),
    					listen_dev(input, "paste", /*paste_handler*/ ctx[18], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*disabled*/ 2) {
    				prop_dev(input, "disabled", /*disabled*/ ctx[1]);
    			}

    			if (dirty & /*searchable*/ 1 && input_readonly_value !== (input_readonly_value = !/*searchable*/ ctx[0])) {
    				prop_dev(input, "readOnly", input_readonly_value);
    			}

    			if (dirty & /*inputStyle*/ 512) {
    				attr_dev(input, "style", /*inputStyle*/ ctx[9]);
    			}

    			if (dirty & /*placeholderText*/ 64) {
    				attr_dev(input, "placeholder", /*placeholderText*/ ctx[6]);
    			}

    			if (dirty & /*$inputValue*/ 256 && input.value !== /*$inputValue*/ ctx[8]) {
    				set_input_value(input, /*$inputValue*/ ctx[8]);
    			}

    			if (dirty & /*shadowText*/ 128) set_data_dev(t1, /*shadowText*/ ctx[7]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(input);
    			/*input_binding*/ ctx[19](null);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(div);
    			div_resize_listener();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let $inputValue,
    		$$unsubscribe_inputValue = noop,
    		$$subscribe_inputValue = () => ($$unsubscribe_inputValue(), $$unsubscribe_inputValue = subscribe(inputValue, $$value => $$invalidate(8, $inputValue = $$value)), inputValue);

    	let $hasDropdownOpened,
    		$$unsubscribe_hasDropdownOpened = noop,
    		$$subscribe_hasDropdownOpened = () => ($$unsubscribe_hasDropdownOpened(), $$unsubscribe_hasDropdownOpened = subscribe(hasDropdownOpened, $$value => $$invalidate(25, $hasDropdownOpened = $$value)), hasDropdownOpened);

    	$$self.$$.on_destroy.push(() => $$unsubscribe_inputValue());
    	$$self.$$.on_destroy.push(() => $$unsubscribe_hasDropdownOpened());
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Input", slots, []);
    	const focus = () => inputRef.focus();
    	let { placeholder } = $$props;
    	let { searchable } = $$props;
    	let { disabled } = $$props;
    	let { multiple } = $$props;
    	let { inputValue } = $$props;
    	validate_store(inputValue, "inputValue");
    	$$subscribe_inputValue();
    	let { hasDropdownOpened } = $$props;
    	validate_store(hasDropdownOpened, "hasDropdownOpened");
    	$$subscribe_hasDropdownOpened();
    	let { selectedOptions } = $$props;
    	let inputRef = null;
    	let shadowWidth = 0;
    	const dispatch = createEventDispatcher();
    	let disableEventBubble = false;

    	function onKeyDown(e) {
    		disableEventBubble = ["Enter", "Escape"].includes(e.key) && $hasDropdownOpened;
    		dispatch("keydown", e);
    	}

    	/** Stop event propagation on keyup, when dropdown is opened. Typically this will prevent form submit */
    	function onKeyUp(e) {
    		if (disableEventBubble) {
    			e.stopImmediatePropagation();
    			e.preventDefault();
    		}

    		disableEventBubble = false;
    	}

    	const writable_props = [
    		"placeholder",
    		"searchable",
    		"disabled",
    		"multiple",
    		"inputValue",
    		"hasDropdownOpened",
    		"selectedOptions"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Input> was created with unknown prop '${key}'`);
    	});

    	function focus_handler(event) {
    		bubble($$self, event);
    	}

    	function blur_handler(event) {
    		bubble($$self, event);
    	}

    	function paste_handler(event) {
    		bubble($$self, event);
    	}

    	function input_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			inputRef = $$value;
    			$$invalidate(4, inputRef);
    		});
    	}

    	function input_input_handler() {
    		$inputValue = this.value;
    		inputValue.set($inputValue);
    	}

    	function div_elementresize_handler() {
    		shadowWidth = this.clientWidth;
    		$$invalidate(5, shadowWidth);
    	}

    	$$self.$$set = $$props => {
    		if ("placeholder" in $$props) $$invalidate(13, placeholder = $$props.placeholder);
    		if ("searchable" in $$props) $$invalidate(0, searchable = $$props.searchable);
    		if ("disabled" in $$props) $$invalidate(1, disabled = $$props.disabled);
    		if ("multiple" in $$props) $$invalidate(14, multiple = $$props.multiple);
    		if ("inputValue" in $$props) $$subscribe_inputValue($$invalidate(2, inputValue = $$props.inputValue));
    		if ("hasDropdownOpened" in $$props) $$subscribe_hasDropdownOpened($$invalidate(3, hasDropdownOpened = $$props.hasDropdownOpened));
    		if ("selectedOptions" in $$props) $$invalidate(15, selectedOptions = $$props.selectedOptions);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		focus,
    		placeholder,
    		searchable,
    		disabled,
    		multiple,
    		inputValue,
    		hasDropdownOpened,
    		selectedOptions,
    		inputRef,
    		shadowWidth,
    		dispatch,
    		disableEventBubble,
    		onKeyDown,
    		onKeyUp,
    		isSingleFilled,
    		placeholderText,
    		shadowText,
    		$inputValue,
    		widthAddition,
    		inputStyle,
    		$hasDropdownOpened
    	});

    	$$self.$inject_state = $$props => {
    		if ("placeholder" in $$props) $$invalidate(13, placeholder = $$props.placeholder);
    		if ("searchable" in $$props) $$invalidate(0, searchable = $$props.searchable);
    		if ("disabled" in $$props) $$invalidate(1, disabled = $$props.disabled);
    		if ("multiple" in $$props) $$invalidate(14, multiple = $$props.multiple);
    		if ("inputValue" in $$props) $$subscribe_inputValue($$invalidate(2, inputValue = $$props.inputValue));
    		if ("hasDropdownOpened" in $$props) $$subscribe_hasDropdownOpened($$invalidate(3, hasDropdownOpened = $$props.hasDropdownOpened));
    		if ("selectedOptions" in $$props) $$invalidate(15, selectedOptions = $$props.selectedOptions);
    		if ("inputRef" in $$props) $$invalidate(4, inputRef = $$props.inputRef);
    		if ("shadowWidth" in $$props) $$invalidate(5, shadowWidth = $$props.shadowWidth);
    		if ("disableEventBubble" in $$props) disableEventBubble = $$props.disableEventBubble;
    		if ("isSingleFilled" in $$props) $$invalidate(23, isSingleFilled = $$props.isSingleFilled);
    		if ("placeholderText" in $$props) $$invalidate(6, placeholderText = $$props.placeholderText);
    		if ("shadowText" in $$props) $$invalidate(7, shadowText = $$props.shadowText);
    		if ("widthAddition" in $$props) $$invalidate(24, widthAddition = $$props.widthAddition);
    		if ("inputStyle" in $$props) $$invalidate(9, inputStyle = $$props.inputStyle);
    	};

    	let isSingleFilled;
    	let placeholderText;
    	let shadowText;
    	let widthAddition;
    	let inputStyle;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*selectedOptions, multiple*/ 49152) {
    			 $$invalidate(23, isSingleFilled = selectedOptions.length > 0 && multiple === false);
    		}

    		if ($$self.$$.dirty & /*selectedOptions, placeholder*/ 40960) {
    			 $$invalidate(6, placeholderText = selectedOptions.length > 0 ? "" : placeholder);
    		}

    		if ($$self.$$.dirty & /*$inputValue, placeholderText*/ 320) {
    			 $$invalidate(7, shadowText = $inputValue || placeholderText);
    		}

    		if ($$self.$$.dirty & /*selectedOptions*/ 32768) {
    			 $$invalidate(24, widthAddition = selectedOptions.length === 0 ? 19 : 12);
    		}

    		if ($$self.$$.dirty & /*isSingleFilled, shadowWidth, widthAddition*/ 25165856) {
    			 $$invalidate(9, inputStyle = `width: ${isSingleFilled ? 2 : shadowWidth + widthAddition}px`);
    		}
    	};

    	return [
    		searchable,
    		disabled,
    		inputValue,
    		hasDropdownOpened,
    		inputRef,
    		shadowWidth,
    		placeholderText,
    		shadowText,
    		$inputValue,
    		inputStyle,
    		onKeyDown,
    		onKeyUp,
    		focus,
    		placeholder,
    		multiple,
    		selectedOptions,
    		focus_handler,
    		blur_handler,
    		paste_handler,
    		input_binding,
    		input_input_handler,
    		div_elementresize_handler
    	];
    }

    class Input extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance, create_fragment, safe_not_equal, {
    			focus: 12,
    			placeholder: 13,
    			searchable: 0,
    			disabled: 1,
    			multiple: 14,
    			inputValue: 2,
    			hasDropdownOpened: 3,
    			selectedOptions: 15
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Input",
    			options,
    			id: create_fragment.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*placeholder*/ ctx[13] === undefined && !("placeholder" in props)) {
    			console.warn("<Input> was created without expected prop 'placeholder'");
    		}

    		if (/*searchable*/ ctx[0] === undefined && !("searchable" in props)) {
    			console.warn("<Input> was created without expected prop 'searchable'");
    		}

    		if (/*disabled*/ ctx[1] === undefined && !("disabled" in props)) {
    			console.warn("<Input> was created without expected prop 'disabled'");
    		}

    		if (/*multiple*/ ctx[14] === undefined && !("multiple" in props)) {
    			console.warn("<Input> was created without expected prop 'multiple'");
    		}

    		if (/*inputValue*/ ctx[2] === undefined && !("inputValue" in props)) {
    			console.warn("<Input> was created without expected prop 'inputValue'");
    		}

    		if (/*hasDropdownOpened*/ ctx[3] === undefined && !("hasDropdownOpened" in props)) {
    			console.warn("<Input> was created without expected prop 'hasDropdownOpened'");
    		}

    		if (/*selectedOptions*/ ctx[15] === undefined && !("selectedOptions" in props)) {
    			console.warn("<Input> was created without expected prop 'selectedOptions'");
    		}
    	}

    	get focus() {
    		return this.$$.ctx[12];
    	}

    	set focus(value) {
    		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get placeholder() {
    		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set placeholder(value) {
    		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get searchable() {
    		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set searchable(value) {
    		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabled() {
    		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get multiple() {
    		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set multiple(value) {
    		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get inputValue() {
    		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set inputValue(value) {
    		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hasDropdownOpened() {
    		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hasDropdownOpened(value) {
    		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selectedOptions() {
    		throw new Error("<Input>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selectedOptions(value) {
    		throw new Error("<Input>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const mouseDownAction = e => e.preventDefault();

    function itemActions(node, {item, index}) {

      function selectAction(e) {
        const eventType = e.target.closest('[data-action="deselect"]') ? 'deselect' : 'select';
        node.dispatchEvent(new CustomEvent(eventType, {
          bubble: true,
          detail: item
        }));
      }

      function hoverAction() {
        node.dispatchEvent(new CustomEvent('hover', {
          detail: index
        }));
      }
      node.onmousedown = mouseDownAction;
      node.onclick = selectAction;
      // !item.isSelected && 
      node.addEventListener('mouseenter', hoverAction);

      return {
        update(updated) {
          item = updated.item;
          index = updated.index;
        },
        destroy() {
          node.removeEventListener('mousedown', mouseDownAction);
          node.removeEventListener('click', selectAction);
          // !item.isSelected && 
          node.removeEventListener('mouseenter', hoverAction);
        }
      }
    }

    /* src\Svelecte\components\Item.svelte generated by Svelte v3.25.0 */
    const file$1 = "src\\Svelecte\\components\\Item.svelte";

    // (18:0) {:else}
    function create_else_block(ctx) {
    	let div;
    	let html_tag;
    	let raw_value = highlightSearch(/*item*/ ctx[2], /*isSelected*/ ctx[3], /*inputValue*/ ctx[0], /*formatter*/ ctx[6]) + "";
    	let t;
    	let div_title_value;
    	let itemActions_action;
    	let mounted;
    	let dispose;
    	let if_block = /*isSelected*/ ctx[3] && /*isMultiple*/ ctx[5] && create_if_block_1(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			t = space();
    			if (if_block) if_block.c();
    			html_tag = new HtmlTag(t);
    			attr_dev(div, "class", "sv-item");
    			attr_dev(div, "title", div_title_value = /*item*/ ctx[2]._created ? "Created item" : "");
    			toggle_class(div, "is-disabled", /*isDisabled*/ ctx[4]);
    			add_location(div, file$1, 18, 0, 477);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			html_tag.m(raw_value, div);
    			append_dev(div, t);
    			if (if_block) if_block.m(div, null);

    			if (!mounted) {
    				dispose = [
    					action_destroyer(itemActions_action = itemActions.call(null, div, {
    						item: /*item*/ ctx[2],
    						index: /*index*/ ctx[1]
    					})),
    					listen_dev(div, "select", /*select_handler*/ ctx[8], false, false, false),
    					listen_dev(div, "deselect", /*deselect_handler*/ ctx[9], false, false, false),
    					listen_dev(div, "hover", /*hover_handler*/ ctx[10], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*item, isSelected, inputValue, formatter*/ 77 && raw_value !== (raw_value = highlightSearch(/*item*/ ctx[2], /*isSelected*/ ctx[3], /*inputValue*/ ctx[0], /*formatter*/ ctx[6]) + "")) html_tag.p(raw_value);

    			if (/*isSelected*/ ctx[3] && /*isMultiple*/ ctx[5]) {
    				if (if_block) ; else {
    					if_block = create_if_block_1(ctx);
    					if_block.c();
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty & /*item*/ 4 && div_title_value !== (div_title_value = /*item*/ ctx[2]._created ? "Created item" : "")) {
    				attr_dev(div, "title", div_title_value);
    			}

    			if (itemActions_action && is_function(itemActions_action.update) && dirty & /*item, index*/ 6) itemActions_action.update.call(null, {
    				item: /*item*/ ctx[2],
    				index: /*index*/ ctx[1]
    			});

    			if (dirty & /*isDisabled*/ 16) {
    				toggle_class(div, "is-disabled", /*isDisabled*/ ctx[4]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block) if_block.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block.name,
    		type: "else",
    		source: "(18:0) {:else}",
    		ctx
    	});

    	return block;
    }

    // (16:0) {#if item.$isGroupHeader}
    function create_if_block(ctx) {
    	let div;
    	let b;
    	let t_value = /*item*/ ctx[2].label + "";
    	let t;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			b = element("b");
    			t = text(t_value);
    			add_location(b, file$1, 16, 57, 441);
    			attr_dev(div, "class", "optgroup-header svelte-10st0l2");
    			add_location(div, file$1, 16, 0, 384);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, b);
    			append_dev(b, t);

    			if (!mounted) {
    				dispose = listen_dev(div, "mousedown", prevent_default(/*mousedown_handler*/ ctx[7]), false, true, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty & /*item*/ 4 && t_value !== (t_value = /*item*/ ctx[2].label + "")) set_data_dev(t, t_value);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(16:0) {#if item.$isGroupHeader}",
    		ctx
    	});

    	return block;
    }

    // (28:0) {#if isSelected && isMultiple}
    function create_if_block_1(ctx) {
    	let a;
    	let svg;
    	let path;

    	const block = {
    		c: function create() {
    			a = element("a");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr_dev(path, "d", "M14.348 14.849c-0.469 0.469-1.229 0.469-1.697 0l-2.651-3.030-2.651 3.029c-0.469 0.469-1.229 0.469-1.697 0-0.469-0.469-0.469-1.229 0-1.697l2.758-3.15-2.759-3.152c-0.469-0.469-0.469-1.228 0-1.697s1.228-0.469 1.697 0l2.652 3.031 2.651-3.031c0.469-0.469 1.228-0.469 1.697 0s0.469 1.229 0 1.697l-2.758 3.152 2.758 3.15c0.469 0.469 0.469 1.229 0 1.698z");
    			add_location(path, file$1, 29, 89, 928);
    			attr_dev(svg, "height", "16");
    			attr_dev(svg, "width", "16");
    			attr_dev(svg, "viewBox", "0 0 20 20");
    			attr_dev(svg, "aria-hidden", "true");
    			attr_dev(svg, "focusable", "false");
    			add_location(svg, file$1, 29, 4, 843);
    			attr_dev(a, "href", "#deselect");
    			attr_dev(a, "class", "sv-item-btn");
    			attr_dev(a, "tabindex", "-1");
    			attr_dev(a, "data-action", "deselect");
    			add_location(a, file$1, 28, 2, 760);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, a, anchor);
    			append_dev(a, svg);
    			append_dev(svg, path);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(a);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(28:0) {#if isSelected && isMultiple}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let if_block_anchor;

    	function select_block_type(ctx, dirty) {
    		if (/*item*/ ctx[2].$isGroupHeader) return create_if_block;
    		return create_else_block;
    	}

    	let current_block_type = select_block_type(ctx);
    	let if_block = current_block_type(ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    		},
    		p: function update(ctx, [dirty]) {
    			if (current_block_type === (current_block_type = select_block_type(ctx)) && if_block) {
    				if_block.p(ctx, dirty);
    			} else {
    				if_block.d(1);
    				if_block = current_block_type(ctx);

    				if (if_block) {
    					if_block.c();
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			}
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Item", slots, []);
    	let { inputValue } = $$props; // value only
    	let { index = -1 } = $$props;
    	let { item = {} } = $$props;
    	let { isSelected = false } = $$props;
    	let { isDisabled = false } = $$props;
    	let { isMultiple = false } = $$props;
    	let { formatter = null } = $$props;

    	const writable_props = [
    		"inputValue",
    		"index",
    		"item",
    		"isSelected",
    		"isDisabled",
    		"isMultiple",
    		"formatter"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Item> was created with unknown prop '${key}'`);
    	});

    	function mousedown_handler(event) {
    		bubble($$self, event);
    	}

    	function select_handler(event) {
    		bubble($$self, event);
    	}

    	function deselect_handler(event) {
    		bubble($$self, event);
    	}

    	function hover_handler(event) {
    		bubble($$self, event);
    	}

    	$$self.$$set = $$props => {
    		if ("inputValue" in $$props) $$invalidate(0, inputValue = $$props.inputValue);
    		if ("index" in $$props) $$invalidate(1, index = $$props.index);
    		if ("item" in $$props) $$invalidate(2, item = $$props.item);
    		if ("isSelected" in $$props) $$invalidate(3, isSelected = $$props.isSelected);
    		if ("isDisabled" in $$props) $$invalidate(4, isDisabled = $$props.isDisabled);
    		if ("isMultiple" in $$props) $$invalidate(5, isMultiple = $$props.isMultiple);
    		if ("formatter" in $$props) $$invalidate(6, formatter = $$props.formatter);
    	};

    	$$self.$capture_state = () => ({
    		itemActions,
    		highlightSearch,
    		inputValue,
    		index,
    		item,
    		isSelected,
    		isDisabled,
    		isMultiple,
    		formatter
    	});

    	$$self.$inject_state = $$props => {
    		if ("inputValue" in $$props) $$invalidate(0, inputValue = $$props.inputValue);
    		if ("index" in $$props) $$invalidate(1, index = $$props.index);
    		if ("item" in $$props) $$invalidate(2, item = $$props.item);
    		if ("isSelected" in $$props) $$invalidate(3, isSelected = $$props.isSelected);
    		if ("isDisabled" in $$props) $$invalidate(4, isDisabled = $$props.isDisabled);
    		if ("isMultiple" in $$props) $$invalidate(5, isMultiple = $$props.isMultiple);
    		if ("formatter" in $$props) $$invalidate(6, formatter = $$props.formatter);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		inputValue,
    		index,
    		item,
    		isSelected,
    		isDisabled,
    		isMultiple,
    		formatter,
    		mousedown_handler,
    		select_handler,
    		deselect_handler,
    		hover_handler
    	];
    }

    class Item extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {
    			inputValue: 0,
    			index: 1,
    			item: 2,
    			isSelected: 3,
    			isDisabled: 4,
    			isMultiple: 5,
    			formatter: 6
    		});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Item",
    			options,
    			id: create_fragment$1.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*inputValue*/ ctx[0] === undefined && !("inputValue" in props)) {
    			console.warn("<Item> was created without expected prop 'inputValue'");
    		}
    	}

    	get inputValue() {
    		throw new Error("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set inputValue(value) {
    		throw new Error("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get index() {
    		throw new Error("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set index(value) {
    		throw new Error("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get item() {
    		throw new Error("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set item(value) {
    		throw new Error("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isSelected() {
    		throw new Error("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isSelected(value) {
    		throw new Error("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isDisabled() {
    		throw new Error("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isDisabled(value) {
    		throw new Error("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isMultiple() {
    		throw new Error("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isMultiple(value) {
    		throw new Error("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get formatter() {
    		throw new Error("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set formatter(value) {
    		throw new Error("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\Svelecte\components\Control.svelte generated by Svelte v3.25.0 */
    const file$2 = "src\\Svelecte\\components\\Control.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[31] = list[i];
    	return child_ctx;
    }

    const get_icon_slot_changes = dirty => ({});
    const get_icon_slot_context = ctx => ({});

    // (67:4) {#if selectedOptions.length }
    function create_if_block_2(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_3, create_else_block$1];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*multiple*/ ctx[5] && /*collapseSelection*/ ctx[6] && /*doCollapse*/ ctx[13]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2.name,
    		type: "if",
    		source: "(67:4) {#if selectedOptions.length }",
    		ctx
    	});

    	return block;
    }

    // (70:6) {:else}
    function create_else_block$1(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = /*selectedOptions*/ ctx[10];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*renderer, selectedOptions, multiple, $inputValue*/ 66596) {
    				each_value = /*selectedOptions*/ ctx[10];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$1.name,
    		type: "else",
    		source: "(70:6) {:else}",
    		ctx
    	});

    	return block;
    }

    // (68:6) {#if multiple && collapseSelection && doCollapse}
    function create_if_block_3(ctx) {
    	let t_value = /*collapseSelection*/ ctx[6](/*selectedOptions*/ ctx[10].length) + "";
    	let t;

    	const block = {
    		c: function create() {
    			t = text(t_value);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t, anchor);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*collapseSelection, selectedOptions*/ 1088 && t_value !== (t_value = /*collapseSelection*/ ctx[6](/*selectedOptions*/ ctx[10].length) + "")) set_data_dev(t, t_value);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3.name,
    		type: "if",
    		source: "(68:6) {#if multiple && collapseSelection && doCollapse}",
    		ctx
    	});

    	return block;
    }

    // (71:6) {#each selectedOptions as opt}
    function create_each_block(ctx) {
    	let item;
    	let current;

    	item = new Item({
    			props: {
    				formatter: /*renderer*/ ctx[2],
    				item: /*opt*/ ctx[31],
    				isSelected: true,
    				isMultiple: /*multiple*/ ctx[5],
    				inputValue: /*$inputValue*/ ctx[16]
    			},
    			$$inline: true
    		});

    	item.$on("deselect", /*deselect_handler*/ ctx[25]);

    	const block = {
    		c: function create() {
    			create_component(item.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(item, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const item_changes = {};
    			if (dirty[0] & /*renderer*/ 4) item_changes.formatter = /*renderer*/ ctx[2];
    			if (dirty[0] & /*selectedOptions*/ 1024) item_changes.item = /*opt*/ ctx[31];
    			if (dirty[0] & /*multiple*/ 32) item_changes.isMultiple = /*multiple*/ ctx[5];
    			if (dirty[0] & /*$inputValue*/ 65536) item_changes.inputValue = /*$inputValue*/ ctx[16];
    			item.$set(item_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(item.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(item.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(item, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(71:6) {#each selectedOptions as opt}",
    		ctx
    	});

    	return block;
    }

    // (88:4) {#if clearable && selectedOptions.length && !disabled}
    function create_if_block_1$1(ctx) {
    	let div;
    	let svg;
    	let path;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr_dev(path, "d", "M14.348 14.849c-0.469 0.469-1.229 0.469-1.697 0l-2.651-3.030-2.651 3.029c-0.469 0.469-1.229 0.469-1.697 0-0.469-0.469-0.469-1.229 0-1.697l2.758-3.15-2.759-3.152c-0.469-0.469-0.469-1.228 0-1.697s1.228-0.469 1.697 0l2.652 3.031 2.651-3.031c0.469-0.469 1.228-0.469 1.697 0s0.469 1.229 0 1.697l-2.758 3.152 2.758 3.15c0.469 0.469 0.469 1.229 0 1.698z");
    			add_location(path, file$2, 92, 114, 2671);
    			attr_dev(svg, "class", "indicator-icon svelte-6rgaw");
    			attr_dev(svg, "height", "20");
    			attr_dev(svg, "width", "20");
    			attr_dev(svg, "viewBox", "0 0 20 20");
    			attr_dev(svg, "aria-hidden", "true");
    			attr_dev(svg, "focusable", "false");
    			add_location(svg, file$2, 92, 6, 2563);
    			attr_dev(div, "aria-hidden", "true");
    			attr_dev(div, "class", "indicator-container close-icon svelte-6rgaw");
    			add_location(div, file$2, 88, 4, 2406);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, svg);
    			append_dev(svg, path);

    			if (!mounted) {
    				dispose = [
    					listen_dev(div, "mousedown", prevent_default(/*mousedown_handler_1*/ ctx[24]), false, true, false),
    					listen_dev(div, "click", /*click_handler*/ ctx[29], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$1.name,
    		type: "if",
    		source: "(88:4) {#if clearable && selectedOptions.length && !disabled}",
    		ctx
    	});

    	return block;
    }

    // (96:4) {#if clearable}
    function create_if_block$1(ctx) {
    	let span;

    	const block = {
    		c: function create() {
    			span = element("span");
    			attr_dev(span, "class", "indicator-separator svelte-6rgaw");
    			add_location(span, file$2, 96, 4, 3091);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(96:4) {#if clearable}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let div3;
    	let t0;
    	let div0;
    	let t1;
    	let input;
    	let t2;
    	let div2;
    	let t3;
    	let t4;
    	let div1;
    	let svg;
    	let path;
    	let current;
    	let mounted;
    	let dispose;
    	const icon_slot_template = /*#slots*/ ctx[21].icon;
    	const icon_slot = create_slot(icon_slot_template, ctx, /*$$scope*/ ctx[20], get_icon_slot_context);
    	let if_block0 = /*selectedOptions*/ ctx[10].length && create_if_block_2(ctx);

    	let input_props = {
    		disabled: /*disabled*/ ctx[3],
    		searchable: /*searchable*/ ctx[1],
    		placeholder: /*placeholder*/ ctx[4],
    		multiple: /*multiple*/ ctx[5],
    		inputValue: /*inputValue*/ ctx[7],
    		hasDropdownOpened: /*hasDropdownOpened*/ ctx[9],
    		selectedOptions: /*selectedOptions*/ ctx[10]
    	};

    	input = new Input({ props: input_props, $$inline: true });
    	/*input_binding*/ ctx[26](input);
    	input.$on("focus", /*onFocus*/ ctx[18]);
    	input.$on("blur", /*onBlur*/ ctx[19]);
    	input.$on("keydown", /*keydown_handler*/ ctx[27]);
    	input.$on("paste", /*paste_handler*/ ctx[28]);
    	let if_block1 = /*clearable*/ ctx[0] && /*selectedOptions*/ ctx[10].length && !/*disabled*/ ctx[3] && create_if_block_1$1(ctx);
    	let if_block2 = /*clearable*/ ctx[0] && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			div3 = element("div");
    			if (icon_slot) icon_slot.c();
    			t0 = space();
    			div0 = element("div");
    			if (if_block0) if_block0.c();
    			t1 = space();
    			create_component(input.$$.fragment);
    			t2 = space();
    			div2 = element("div");
    			if (if_block1) if_block1.c();
    			t3 = space();
    			if (if_block2) if_block2.c();
    			t4 = space();
    			div1 = element("div");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr_dev(div0, "class", "sv-content sv-input-row svelte-6rgaw");
    			toggle_class(div0, "has-multiSelection", /*multiple*/ ctx[5]);
    			add_location(div0, file$2, 65, 2, 1528);
    			attr_dev(path, "d", "M4.516 7.548c0.436-0.446 1.043-0.481 1.576 0l3.908 3.747 3.908-3.747c0.533-0.481 1.141-0.446 1.574 0 0.436 0.445 0.408 1.197 0 1.615-0.406 0.418-4.695 4.502-4.695 4.502-0.217 0.223-0.502 0.335-0.787 0.335s-0.57-0.112-0.789-0.335c0 0-4.287-4.084-4.695-4.502s-0.436-1.17 0-1.615z");
    			add_location(path, file$2, 100, 8, 3343);
    			attr_dev(svg, "width", "20");
    			attr_dev(svg, "class", "indicator-icon svelte-6rgaw");
    			attr_dev(svg, "viewBox", "0 0 20 20");
    			attr_dev(svg, "aria-hidden", "true");
    			attr_dev(svg, "focusable", "false");
    			add_location(svg, file$2, 99, 6, 3237);
    			attr_dev(div1, "aria-hidden", "true");
    			attr_dev(div1, "class", "indicator-container svelte-6rgaw");
    			add_location(div1, file$2, 98, 4, 3149);
    			attr_dev(div2, "class", "indicator svelte-6rgaw");
    			toggle_class(div2, "is-loading", /*isFetchingData*/ ctx[11]);
    			add_location(div2, file$2, 86, 2, 2282);
    			attr_dev(div3, "class", "sv-control svelte-6rgaw");
    			toggle_class(div3, "is-active", /*$hasFocus*/ ctx[15]);
    			toggle_class(div3, "is-disabled", /*disabled*/ ctx[3]);
    			add_location(div3, file$2, 59, 0, 1309);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div3, anchor);

    			if (icon_slot) {
    				icon_slot.m(div3, null);
    			}

    			append_dev(div3, t0);
    			append_dev(div3, div0);
    			if (if_block0) if_block0.m(div0, null);
    			append_dev(div0, t1);
    			mount_component(input, div0, null);
    			append_dev(div3, t2);
    			append_dev(div3, div2);
    			if (if_block1) if_block1.m(div2, null);
    			append_dev(div2, t3);
    			if (if_block2) if_block2.m(div2, null);
    			append_dev(div2, t4);
    			append_dev(div2, div1);
    			append_dev(div1, svg);
    			append_dev(svg, path);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(div1, "mousedown", prevent_default(/*mousedown_handler_2*/ ctx[23]), false, true, false),
    					listen_dev(div3, "mousedown", prevent_default(/*mousedown_handler*/ ctx[22]), false, true, false),
    					listen_dev(div3, "click", prevent_default(/*focusControl*/ ctx[12]), false, true, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (icon_slot) {
    				if (icon_slot.p && dirty[0] & /*$$scope*/ 1048576) {
    					update_slot(icon_slot, icon_slot_template, ctx, /*$$scope*/ ctx[20], dirty, get_icon_slot_changes, get_icon_slot_context);
    				}
    			}

    			if (/*selectedOptions*/ ctx[10].length) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*selectedOptions*/ 1024) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_2(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div0, t1);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			const input_changes = {};
    			if (dirty[0] & /*disabled*/ 8) input_changes.disabled = /*disabled*/ ctx[3];
    			if (dirty[0] & /*searchable*/ 2) input_changes.searchable = /*searchable*/ ctx[1];
    			if (dirty[0] & /*placeholder*/ 16) input_changes.placeholder = /*placeholder*/ ctx[4];
    			if (dirty[0] & /*multiple*/ 32) input_changes.multiple = /*multiple*/ ctx[5];
    			if (dirty[0] & /*inputValue*/ 128) input_changes.inputValue = /*inputValue*/ ctx[7];
    			if (dirty[0] & /*hasDropdownOpened*/ 512) input_changes.hasDropdownOpened = /*hasDropdownOpened*/ ctx[9];
    			if (dirty[0] & /*selectedOptions*/ 1024) input_changes.selectedOptions = /*selectedOptions*/ ctx[10];
    			input.$set(input_changes);

    			if (dirty[0] & /*multiple*/ 32) {
    				toggle_class(div0, "has-multiSelection", /*multiple*/ ctx[5]);
    			}

    			if (/*clearable*/ ctx[0] && /*selectedOptions*/ ctx[10].length && !/*disabled*/ ctx[3]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_1$1(ctx);
    					if_block1.c();
    					if_block1.m(div2, t3);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*clearable*/ ctx[0]) {
    				if (if_block2) ; else {
    					if_block2 = create_if_block$1(ctx);
    					if_block2.c();
    					if_block2.m(div2, t4);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (dirty[0] & /*isFetchingData*/ 2048) {
    				toggle_class(div2, "is-loading", /*isFetchingData*/ ctx[11]);
    			}

    			if (dirty[0] & /*$hasFocus*/ 32768) {
    				toggle_class(div3, "is-active", /*$hasFocus*/ ctx[15]);
    			}

    			if (dirty[0] & /*disabled*/ 8) {
    				toggle_class(div3, "is-disabled", /*disabled*/ ctx[3]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(icon_slot, local);
    			transition_in(if_block0);
    			transition_in(input.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(icon_slot, local);
    			transition_out(if_block0);
    			transition_out(input.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div3);
    			if (icon_slot) icon_slot.d(detaching);
    			if (if_block0) if_block0.d();
    			/*input_binding*/ ctx[26](null);
    			destroy_component(input);
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	let $hasFocus,
    		$$unsubscribe_hasFocus = noop,
    		$$subscribe_hasFocus = () => ($$unsubscribe_hasFocus(), $$unsubscribe_hasFocus = subscribe(hasFocus, $$value => $$invalidate(15, $hasFocus = $$value)), hasFocus);

    	let $hasDropdownOpened,
    		$$unsubscribe_hasDropdownOpened = noop,
    		$$subscribe_hasDropdownOpened = () => ($$unsubscribe_hasDropdownOpened(), $$unsubscribe_hasDropdownOpened = subscribe(hasDropdownOpened, $$value => $$invalidate(30, $hasDropdownOpened = $$value)), hasDropdownOpened);

    	let $inputValue,
    		$$unsubscribe_inputValue = noop,
    		$$subscribe_inputValue = () => ($$unsubscribe_inputValue(), $$unsubscribe_inputValue = subscribe(inputValue, $$value => $$invalidate(16, $inputValue = $$value)), inputValue);

    	$$self.$$.on_destroy.push(() => $$unsubscribe_hasFocus());
    	$$self.$$.on_destroy.push(() => $$unsubscribe_hasDropdownOpened());
    	$$self.$$.on_destroy.push(() => $$unsubscribe_inputValue());
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Control", slots, ['icon']);
    	let { clearable } = $$props;
    	let { searchable } = $$props;
    	let { renderer } = $$props;
    	let { disabled } = $$props;
    	let { placeholder } = $$props;
    	let { multiple } = $$props;
    	let { collapseSelection } = $$props;
    	let { inputValue } = $$props;
    	validate_store(inputValue, "inputValue");
    	$$subscribe_inputValue();
    	let { hasFocus } = $$props;
    	validate_store(hasFocus, "hasFocus");
    	$$subscribe_hasFocus();
    	let { hasDropdownOpened } = $$props;
    	validate_store(hasDropdownOpened, "hasDropdownOpened");
    	$$subscribe_hasDropdownOpened();
    	let { selectedOptions } = $$props;
    	let { isFetchingData } = $$props;

    	function focusControl(event) {
    		if (disabled) return;

    		if (!event) {
    			!$hasFocus && refInput.focus();
    			set_store_value(hasDropdownOpened, $hasDropdownOpened = true);
    			return;
    		}

    		if (!$hasFocus) {
    			refInput.focus();
    		} else {
    			set_store_value(hasDropdownOpened, $hasDropdownOpened = !$hasDropdownOpened);
    		}
    	}

    	/** ************************************ context */
    	const dispatch = createEventDispatcher();

    	let doCollapse = true;
    	let refInput = undefined;

    	function onFocus() {
    		set_store_value(hasFocus, $hasFocus = true);
    		set_store_value(hasDropdownOpened, $hasDropdownOpened = true);

    		setTimeout(
    			() => {
    				$$invalidate(13, doCollapse = false);
    			},
    			150
    		);
    	}

    	function onBlur() {
    		set_store_value(hasFocus, $hasFocus = false);
    		set_store_value(hasDropdownOpened, $hasDropdownOpened = false);
    		set_store_value(inputValue, $inputValue = ""); // reset

    		setTimeout(
    			() => {
    				$$invalidate(13, doCollapse = true);
    			},
    			100
    		);
    	}

    	const writable_props = [
    		"clearable",
    		"searchable",
    		"renderer",
    		"disabled",
    		"placeholder",
    		"multiple",
    		"collapseSelection",
    		"inputValue",
    		"hasFocus",
    		"hasDropdownOpened",
    		"selectedOptions",
    		"isFetchingData"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Control> was created with unknown prop '${key}'`);
    	});

    	function mousedown_handler(event) {
    		bubble($$self, event);
    	}

    	function mousedown_handler_2(event) {
    		bubble($$self, event);
    	}

    	function mousedown_handler_1(event) {
    		bubble($$self, event);
    	}

    	function deselect_handler(event) {
    		bubble($$self, event);
    	}

    	function input_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			refInput = $$value;
    			$$invalidate(14, refInput);
    		});
    	}

    	function keydown_handler(event) {
    		bubble($$self, event);
    	}

    	function paste_handler(event) {
    		bubble($$self, event);
    	}

    	const click_handler = () => dispatch("deselect");

    	$$self.$$set = $$props => {
    		if ("clearable" in $$props) $$invalidate(0, clearable = $$props.clearable);
    		if ("searchable" in $$props) $$invalidate(1, searchable = $$props.searchable);
    		if ("renderer" in $$props) $$invalidate(2, renderer = $$props.renderer);
    		if ("disabled" in $$props) $$invalidate(3, disabled = $$props.disabled);
    		if ("placeholder" in $$props) $$invalidate(4, placeholder = $$props.placeholder);
    		if ("multiple" in $$props) $$invalidate(5, multiple = $$props.multiple);
    		if ("collapseSelection" in $$props) $$invalidate(6, collapseSelection = $$props.collapseSelection);
    		if ("inputValue" in $$props) $$subscribe_inputValue($$invalidate(7, inputValue = $$props.inputValue));
    		if ("hasFocus" in $$props) $$subscribe_hasFocus($$invalidate(8, hasFocus = $$props.hasFocus));
    		if ("hasDropdownOpened" in $$props) $$subscribe_hasDropdownOpened($$invalidate(9, hasDropdownOpened = $$props.hasDropdownOpened));
    		if ("selectedOptions" in $$props) $$invalidate(10, selectedOptions = $$props.selectedOptions);
    		if ("isFetchingData" in $$props) $$invalidate(11, isFetchingData = $$props.isFetchingData);
    		if ("$$scope" in $$props) $$invalidate(20, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		Input,
    		Item,
    		clearable,
    		searchable,
    		renderer,
    		disabled,
    		placeholder,
    		multiple,
    		collapseSelection,
    		inputValue,
    		hasFocus,
    		hasDropdownOpened,
    		selectedOptions,
    		isFetchingData,
    		focusControl,
    		dispatch,
    		doCollapse,
    		refInput,
    		onFocus,
    		onBlur,
    		$hasFocus,
    		$hasDropdownOpened,
    		$inputValue
    	});

    	$$self.$inject_state = $$props => {
    		if ("clearable" in $$props) $$invalidate(0, clearable = $$props.clearable);
    		if ("searchable" in $$props) $$invalidate(1, searchable = $$props.searchable);
    		if ("renderer" in $$props) $$invalidate(2, renderer = $$props.renderer);
    		if ("disabled" in $$props) $$invalidate(3, disabled = $$props.disabled);
    		if ("placeholder" in $$props) $$invalidate(4, placeholder = $$props.placeholder);
    		if ("multiple" in $$props) $$invalidate(5, multiple = $$props.multiple);
    		if ("collapseSelection" in $$props) $$invalidate(6, collapseSelection = $$props.collapseSelection);
    		if ("inputValue" in $$props) $$subscribe_inputValue($$invalidate(7, inputValue = $$props.inputValue));
    		if ("hasFocus" in $$props) $$subscribe_hasFocus($$invalidate(8, hasFocus = $$props.hasFocus));
    		if ("hasDropdownOpened" in $$props) $$subscribe_hasDropdownOpened($$invalidate(9, hasDropdownOpened = $$props.hasDropdownOpened));
    		if ("selectedOptions" in $$props) $$invalidate(10, selectedOptions = $$props.selectedOptions);
    		if ("isFetchingData" in $$props) $$invalidate(11, isFetchingData = $$props.isFetchingData);
    		if ("doCollapse" in $$props) $$invalidate(13, doCollapse = $$props.doCollapse);
    		if ("refInput" in $$props) $$invalidate(14, refInput = $$props.refInput);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [
    		clearable,
    		searchable,
    		renderer,
    		disabled,
    		placeholder,
    		multiple,
    		collapseSelection,
    		inputValue,
    		hasFocus,
    		hasDropdownOpened,
    		selectedOptions,
    		isFetchingData,
    		focusControl,
    		doCollapse,
    		refInput,
    		$hasFocus,
    		$inputValue,
    		dispatch,
    		onFocus,
    		onBlur,
    		$$scope,
    		slots,
    		mousedown_handler,
    		mousedown_handler_2,
    		mousedown_handler_1,
    		deselect_handler,
    		input_binding,
    		keydown_handler,
    		paste_handler,
    		click_handler
    	];
    }

    class Control extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance$2,
    			create_fragment$2,
    			safe_not_equal,
    			{
    				clearable: 0,
    				searchable: 1,
    				renderer: 2,
    				disabled: 3,
    				placeholder: 4,
    				multiple: 5,
    				collapseSelection: 6,
    				inputValue: 7,
    				hasFocus: 8,
    				hasDropdownOpened: 9,
    				selectedOptions: 10,
    				isFetchingData: 11,
    				focusControl: 12
    			},
    			[-1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Control",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*clearable*/ ctx[0] === undefined && !("clearable" in props)) {
    			console.warn("<Control> was created without expected prop 'clearable'");
    		}

    		if (/*searchable*/ ctx[1] === undefined && !("searchable" in props)) {
    			console.warn("<Control> was created without expected prop 'searchable'");
    		}

    		if (/*renderer*/ ctx[2] === undefined && !("renderer" in props)) {
    			console.warn("<Control> was created without expected prop 'renderer'");
    		}

    		if (/*disabled*/ ctx[3] === undefined && !("disabled" in props)) {
    			console.warn("<Control> was created without expected prop 'disabled'");
    		}

    		if (/*placeholder*/ ctx[4] === undefined && !("placeholder" in props)) {
    			console.warn("<Control> was created without expected prop 'placeholder'");
    		}

    		if (/*multiple*/ ctx[5] === undefined && !("multiple" in props)) {
    			console.warn("<Control> was created without expected prop 'multiple'");
    		}

    		if (/*collapseSelection*/ ctx[6] === undefined && !("collapseSelection" in props)) {
    			console.warn("<Control> was created without expected prop 'collapseSelection'");
    		}

    		if (/*inputValue*/ ctx[7] === undefined && !("inputValue" in props)) {
    			console.warn("<Control> was created without expected prop 'inputValue'");
    		}

    		if (/*hasFocus*/ ctx[8] === undefined && !("hasFocus" in props)) {
    			console.warn("<Control> was created without expected prop 'hasFocus'");
    		}

    		if (/*hasDropdownOpened*/ ctx[9] === undefined && !("hasDropdownOpened" in props)) {
    			console.warn("<Control> was created without expected prop 'hasDropdownOpened'");
    		}

    		if (/*selectedOptions*/ ctx[10] === undefined && !("selectedOptions" in props)) {
    			console.warn("<Control> was created without expected prop 'selectedOptions'");
    		}

    		if (/*isFetchingData*/ ctx[11] === undefined && !("isFetchingData" in props)) {
    			console.warn("<Control> was created without expected prop 'isFetchingData'");
    		}
    	}

    	get clearable() {
    		throw new Error("<Control>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set clearable(value) {
    		throw new Error("<Control>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get searchable() {
    		throw new Error("<Control>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set searchable(value) {
    		throw new Error("<Control>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get renderer() {
    		throw new Error("<Control>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set renderer(value) {
    		throw new Error("<Control>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabled() {
    		throw new Error("<Control>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<Control>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get placeholder() {
    		throw new Error("<Control>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set placeholder(value) {
    		throw new Error("<Control>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get multiple() {
    		throw new Error("<Control>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set multiple(value) {
    		throw new Error("<Control>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get collapseSelection() {
    		throw new Error("<Control>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set collapseSelection(value) {
    		throw new Error("<Control>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get inputValue() {
    		throw new Error("<Control>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set inputValue(value) {
    		throw new Error("<Control>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hasFocus() {
    		throw new Error("<Control>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hasFocus(value) {
    		throw new Error("<Control>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hasDropdownOpened() {
    		throw new Error("<Control>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hasDropdownOpened(value) {
    		throw new Error("<Control>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selectedOptions() {
    		throw new Error("<Control>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selectedOptions(value) {
    		throw new Error("<Control>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get isFetchingData() {
    		throw new Error("<Control>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set isFetchingData(value) {
    		throw new Error("<Control>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get focusControl() {
    		return this.$$.ctx[12];
    	}

    	set focusControl(value) {
    		throw new Error("<Control>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const ALIGNMENT = {
    	AUTO:   'auto',
    	START:  'start',
    	CENTER: 'center',
    	END:    'end',
    };

    const DIRECTION = {
    	HORIZONTAL: 'horizontal',
    	VERTICAL:   'vertical',
    };

    const SCROLL_CHANGE_REASON = {
    	OBSERVED:  0,
    	REQUESTED: 1,
    };

    const SCROLL_PROP = {
    	[DIRECTION.VERTICAL]:   'scrollTop',
    	[DIRECTION.HORIZONTAL]: 'scrollLeft',
    };

    /* Forked from react-virtualized 💖 */

    /**
     * @callback ItemSizeGetter
     * @param {number} index
     * @return {number}
     */

    /**
     * @typedef ItemSize
     * @type {number | number[] | ItemSizeGetter}
     */

    /**
     * @typedef SizeAndPosition
     * @type {object}
     * @property {number} size
     * @property {number} offset
     */

    /**
     * @typedef SizeAndPositionData
     * @type {Object.<number, SizeAndPosition>}
     */

    /**
     * @typedef Options
     * @type {object}
     * @property {number} itemCount
     * @property {ItemSize} itemSize
     * @property {number} estimatedItemSize
     */

    class SizeAndPositionManager {

    	/**
    	 * @param {Options} options
    	 */
    	constructor({ itemSize, itemCount, estimatedItemSize }) {
    		/**
    		 * @private
    		 * @type {ItemSize}
    		 */
    		this.itemSize = itemSize;

    		/**
    		 * @private
    		 * @type {number}
    		 */
    		this.itemCount = itemCount;

    		/**
    		 * @private
    		 * @type {number}
    		 */
    		this.estimatedItemSize = estimatedItemSize;

    		/**
    		 * Cache of size and position data for items, mapped by item index.
    		 *
    		 * @private
    		 * @type {SizeAndPositionData}
    		 */
    		this.itemSizeAndPositionData = {};

    		/**
    		 * Measurements for items up to this index can be trusted; items afterward should be estimated.
    		 *
    		 * @private
    		 * @type {number}
    		 */
    		this.lastMeasuredIndex = -1;

    		this.checkForMismatchItemSizeAndItemCount();

    		if (!this.justInTime) this.computeTotalSizeAndPositionData();
    	}

    	get justInTime() {
    		return typeof this.itemSize === 'function';
    	}

    	/**
    	 * @param {Options} options
    	 */
    	updateConfig({ itemSize, itemCount, estimatedItemSize }) {
    		if (itemCount != null) {
    			this.itemCount = itemCount;
    		}

    		if (estimatedItemSize != null) {
    			this.estimatedItemSize = estimatedItemSize;
    		}

    		if (itemSize != null) {
    			this.itemSize = itemSize;
    		}

    		this.checkForMismatchItemSizeAndItemCount();

    		if (this.justInTime && this.totalSize != null) {
    			this.totalSize = undefined;
    		} else {
    			this.computeTotalSizeAndPositionData();
    		}
    	}

    	checkForMismatchItemSizeAndItemCount() {
    		if (Array.isArray(this.itemSize) && this.itemSize.length < this.itemCount) {
    			throw Error(
    				`When itemSize is an array, itemSize.length can't be smaller than itemCount`,
    			);
    		}
    	}

    	/**
    	 * @param {number} index
    	 */
    	getSize(index) {
    		const { itemSize } = this;

    		if (typeof itemSize === 'function') {
    			return itemSize(index);
    		}

    		return Array.isArray(itemSize) ? itemSize[index] : itemSize;
    	}

    	/**
    	 * Compute the totalSize and itemSizeAndPositionData at the start,
    	 * only when itemSize is a number or an array.
    	 */
    	computeTotalSizeAndPositionData() {
    		let totalSize = 0;
    		for (let i = 0; i < this.itemCount; i++) {
    			const size = this.getSize(i);
    			const offset = totalSize;
    			totalSize += size;

    			this.itemSizeAndPositionData[i] = {
    				offset,
    				size,
    			};
    		}

    		this.totalSize = totalSize;
    	}

    	getLastMeasuredIndex() {
    		return this.lastMeasuredIndex;
    	}


    	/**
    	 * This method returns the size and position for the item at the specified index.
    	 *
    	 * @param {number} index
    	 */
    	getSizeAndPositionForIndex(index) {
    		if (index < 0 || index >= this.itemCount) {
    			throw Error(
    				`Requested index ${index} is outside of range 0..${this.itemCount}`,
    			);
    		}

    		return this.justInTime
    			? this.getJustInTimeSizeAndPositionForIndex(index)
    			: this.itemSizeAndPositionData[index];
    	}

    	/**
    	 * This is used when itemSize is a function.
    	 * just-in-time calculates (or used cached values) for items leading up to the index.
    	 *
    	 * @param {number} index
    	 */
    	getJustInTimeSizeAndPositionForIndex(index) {
    		if (index > this.lastMeasuredIndex) {
    			const lastMeasuredSizeAndPosition = this.getSizeAndPositionOfLastMeasuredItem();
    			let offset =
    				    lastMeasuredSizeAndPosition.offset + lastMeasuredSizeAndPosition.size;

    			for (let i = this.lastMeasuredIndex + 1; i <= index; i++) {
    				const size = this.getSize(i);

    				if (size == null || isNaN(size)) {
    					throw Error(`Invalid size returned for index ${i} of value ${size}`);
    				}

    				this.itemSizeAndPositionData[i] = {
    					offset,
    					size,
    				};

    				offset += size;
    			}

    			this.lastMeasuredIndex = index;
    		}

    		return this.itemSizeAndPositionData[index];
    	}

    	getSizeAndPositionOfLastMeasuredItem() {
    		return this.lastMeasuredIndex >= 0
    			? this.itemSizeAndPositionData[this.lastMeasuredIndex]
    			: { offset: 0, size: 0 };
    	}

    	/**
    	 * Total size of all items being measured.
    	 *
    	 * @return {number}
    	 */
    	getTotalSize() {
    		// Return the pre computed totalSize when itemSize is number or array.
    		if (this.totalSize) return this.totalSize;

    		/**
    		 * When itemSize is a function,
    		 * This value will be completedly estimated initially.
    		 * As items as measured the estimate will be updated.
    		 */
    		const lastMeasuredSizeAndPosition = this.getSizeAndPositionOfLastMeasuredItem();

    		return (
    			lastMeasuredSizeAndPosition.offset +
    			lastMeasuredSizeAndPosition.size +
    			(this.itemCount - this.lastMeasuredIndex - 1) * this.estimatedItemSize
    		);
    	}

    	/**
    	 * Determines a new offset that ensures a certain item is visible, given the alignment.
    	 *
    	 * @param {'auto' | 'start' | 'center' | 'end'} align Desired alignment within container
    	 * @param {number | undefined} containerSize Size (width or height) of the container viewport
    	 * @param {number | undefined} currentOffset
    	 * @param {number | undefined} targetIndex
    	 * @return {number} Offset to use to ensure the specified item is visible
    	 */
    	getUpdatedOffsetForIndex({ align = ALIGNMENT.START, containerSize, currentOffset, targetIndex }) {
    		if (containerSize <= 0) {
    			return 0;
    		}

    		const datum = this.getSizeAndPositionForIndex(targetIndex);
    		const maxOffset = datum.offset;
    		const minOffset = maxOffset - containerSize + datum.size;

    		let idealOffset;

    		switch (align) {
    			case ALIGNMENT.END:
    				idealOffset = minOffset;
    				break;
    			case ALIGNMENT.CENTER:
    				idealOffset = maxOffset - (containerSize - datum.size) / 2;
    				break;
    			case ALIGNMENT.START:
    				idealOffset = maxOffset;
    				break;
    			default:
    				idealOffset = Math.max(minOffset, Math.min(maxOffset, currentOffset));
    		}

    		const totalSize = this.getTotalSize();

    		return Math.max(0, Math.min(totalSize - containerSize, idealOffset));
    	}

    	/**
    	 * @param {number} containerSize
    	 * @param {number} offset
    	 * @param {number} overscanCount
    	 * @return {{stop: number|undefined, start: number|undefined}}
    	 */
    	getVisibleRange({ containerSize = 0, offset, overscanCount }) {
    		const totalSize = this.getTotalSize();

    		if (totalSize === 0) {
    			return {};
    		}

    		const maxOffset = offset + containerSize;
    		let start = this.findNearestItem(offset);

    		if (start === undefined) {
    			throw Error(`Invalid offset ${offset} specified`);
    		}

    		const datum = this.getSizeAndPositionForIndex(start);
    		offset = datum.offset + datum.size;

    		let stop = start;

    		while (offset < maxOffset && stop < this.itemCount - 1) {
    			stop++;
    			offset += this.getSizeAndPositionForIndex(stop).size;
    		}

    		if (overscanCount) {
    			start = Math.max(0, start - overscanCount);
    			stop = Math.min(stop + overscanCount, this.itemCount - 1);
    		}

    		return {
    			start,
    			stop,
    		};
    	}

    	/**
    	 * Clear all cached values for items after the specified index.
    	 * This method should be called for any item that has changed its size.
    	 * It will not immediately perform any calculations; they'll be performed the next time getSizeAndPositionForIndex() is called.
    	 *
    	 * @param {number} index
    	 */
    	resetItem(index) {
    		this.lastMeasuredIndex = Math.min(this.lastMeasuredIndex, index - 1);
    	}

    	/**
    	 * Searches for the item (index) nearest the specified offset.
    	 *
    	 * If no exact match is found the next lowest item index will be returned.
    	 * This allows partially visible items (with offsets just before/above the fold) to be visible.
    	 *
    	 * @param {number} offset
    	 */
    	findNearestItem(offset) {
    		if (isNaN(offset)) {
    			throw Error(`Invalid offset ${offset} specified`);
    		}

    		// Our search algorithms find the nearest match at or below the specified offset.
    		// So make sure the offset is at least 0 or no match will be found.
    		offset = Math.max(0, offset);

    		const lastMeasuredSizeAndPosition = this.getSizeAndPositionOfLastMeasuredItem();
    		const lastMeasuredIndex = Math.max(0, this.lastMeasuredIndex);

    		if (lastMeasuredSizeAndPosition.offset >= offset) {
    			// If we've already measured items within this range just use a binary search as it's faster.
    			return this.binarySearch({
    				high: lastMeasuredIndex,
    				low:  0,
    				offset,
    			});
    		} else {
    			// If we haven't yet measured this high, fallback to an exponential search with an inner binary search.
    			// The exponential search avoids pre-computing sizes for the full set of items as a binary search would.
    			// The overall complexity for this approach is O(log n).
    			return this.exponentialSearch({
    				index: lastMeasuredIndex,
    				offset,
    			});
    		}
    	}

    	/**
    	 * @private
    	 * @param {number} low
    	 * @param {number} high
    	 * @param {number} offset
    	 */
    	binarySearch({ low, high, offset }) {
    		let middle = 0;
    		let currentOffset = 0;

    		while (low <= high) {
    			middle = low + Math.floor((high - low) / 2);
    			currentOffset = this.getSizeAndPositionForIndex(middle).offset;

    			if (currentOffset === offset) {
    				return middle;
    			} else if (currentOffset < offset) {
    				low = middle + 1;
    			} else if (currentOffset > offset) {
    				high = middle - 1;
    			}
    		}

    		if (low > 0) {
    			return low - 1;
    		}

    		return 0;
    	}

    	/**
    	 * @private
    	 * @param {number} index
    	 * @param {number} offset
    	 */
    	exponentialSearch({ index, offset }) {
    		let interval = 1;

    		while (
    			index < this.itemCount &&
    			this.getSizeAndPositionForIndex(index).offset < offset
    			) {
    			index += interval;
    			interval *= 2;
    		}

    		return this.binarySearch({
    			high: Math.min(index, this.itemCount - 1),
    			low:  Math.floor(index / 2),
    			offset,
    		});
    	}
    }

    /* node_modules\svelte-tiny-virtual-list\src\VirtualList.svelte generated by Svelte v3.25.0 */

    const { Object: Object_1 } = globals;
    const file$3 = "node_modules\\svelte-tiny-virtual-list\\src\\VirtualList.svelte";
    const get_footer_slot_changes = dirty => ({});
    const get_footer_slot_context = ctx => ({});

    const get_item_slot_changes = dirty => ({
    	style: dirty[0] & /*items*/ 2,
    	index: dirty[0] & /*items*/ 2
    });

    const get_item_slot_context = ctx => ({
    	style: /*item*/ ctx[35].style,
    	index: /*item*/ ctx[35].index
    });

    function get_each_context$1(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[35] = list[i];
    	return child_ctx;
    }

    const get_header_slot_changes = dirty => ({});
    const get_header_slot_context = ctx => ({});

    // (317:2) {#each items as item (item.index)}
    function create_each_block$1(key_1, ctx) {
    	let first;
    	let current;
    	const item_slot_template = /*#slots*/ ctx[17].item;
    	const item_slot = create_slot(item_slot_template, ctx, /*$$scope*/ ctx[16], get_item_slot_context);

    	const block = {
    		key: key_1,
    		first: null,
    		c: function create() {
    			first = empty();
    			if (item_slot) item_slot.c();
    			this.first = first;
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, first, anchor);

    			if (item_slot) {
    				item_slot.m(target, anchor);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (item_slot) {
    				if (item_slot.p && dirty[0] & /*$$scope, items*/ 65538) {
    					update_slot(item_slot, item_slot_template, ctx, /*$$scope*/ ctx[16], dirty, get_item_slot_changes, get_item_slot_context);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(item_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(item_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(first);
    			if (item_slot) item_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$1.name,
    		type: "each",
    		source: "(317:2) {#each items as item (item.index)}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$3(ctx) {
    	let div1;
    	let t0;
    	let div0;
    	let each_blocks = [];
    	let each_1_lookup = new Map();
    	let t1;
    	let current;
    	const header_slot_template = /*#slots*/ ctx[17].header;
    	const header_slot = create_slot(header_slot_template, ctx, /*$$scope*/ ctx[16], get_header_slot_context);
    	let each_value = /*items*/ ctx[1];
    	validate_each_argument(each_value);
    	const get_key = ctx => /*item*/ ctx[35].index;
    	validate_each_keys(ctx, each_value, get_each_context$1, get_key);

    	for (let i = 0; i < each_value.length; i += 1) {
    		let child_ctx = get_each_context$1(ctx, each_value, i);
    		let key = get_key(child_ctx);
    		each_1_lookup.set(key, each_blocks[i] = create_each_block$1(key, child_ctx));
    	}

    	const footer_slot_template = /*#slots*/ ctx[17].footer;
    	const footer_slot = create_slot(footer_slot_template, ctx, /*$$scope*/ ctx[16], get_footer_slot_context);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			if (header_slot) header_slot.c();
    			t0 = space();
    			div0 = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t1 = space();
    			if (footer_slot) footer_slot.c();
    			attr_dev(div0, "class", "virtual-list-inner svelte-1he1ex4");
    			attr_dev(div0, "style", /*innerStyle*/ ctx[3]);
    			add_location(div0, file$3, 315, 1, 7137);
    			attr_dev(div1, "class", "virtual-list-wrapper svelte-1he1ex4");
    			attr_dev(div1, "style", /*wrapperStyle*/ ctx[2]);
    			add_location(div1, file$3, 312, 0, 7035);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);

    			if (header_slot) {
    				header_slot.m(div1, null);
    			}

    			append_dev(div1, t0);
    			append_dev(div1, div0);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div0, null);
    			}

    			append_dev(div1, t1);

    			if (footer_slot) {
    				footer_slot.m(div1, null);
    			}

    			/*div1_binding*/ ctx[18](div1);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (header_slot) {
    				if (header_slot.p && dirty[0] & /*$$scope*/ 65536) {
    					update_slot(header_slot, header_slot_template, ctx, /*$$scope*/ ctx[16], dirty, get_header_slot_changes, get_header_slot_context);
    				}
    			}

    			if (dirty[0] & /*$$scope, items*/ 65538) {
    				const each_value = /*items*/ ctx[1];
    				validate_each_argument(each_value);
    				group_outros();
    				validate_each_keys(ctx, each_value, get_each_context$1, get_key);
    				each_blocks = update_keyed_each(each_blocks, dirty, get_key, 1, ctx, each_value, each_1_lookup, div0, outro_and_destroy_block, create_each_block$1, null, get_each_context$1);
    				check_outros();
    			}

    			if (!current || dirty[0] & /*innerStyle*/ 8) {
    				attr_dev(div0, "style", /*innerStyle*/ ctx[3]);
    			}

    			if (footer_slot) {
    				if (footer_slot.p && dirty[0] & /*$$scope*/ 65536) {
    					update_slot(footer_slot, footer_slot_template, ctx, /*$$scope*/ ctx[16], dirty, get_footer_slot_changes, get_footer_slot_context);
    				}
    			}

    			if (!current || dirty[0] & /*wrapperStyle*/ 4) {
    				attr_dev(div1, "style", /*wrapperStyle*/ ctx[2]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(header_slot, local);

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			transition_in(footer_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(header_slot, local);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			transition_out(footer_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (header_slot) header_slot.d(detaching);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].d();
    			}

    			if (footer_slot) footer_slot.d(detaching);
    			/*div1_binding*/ ctx[18](null);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const thirdEventArg = (() => {
    	let result = false;

    	try {
    		const arg = Object.defineProperty({}, "passive", {
    			get() {
    				result = { passive: true };
    				return true;
    			}
    		});

    		window.addEventListener("testpassive", arg, arg);
    		window.remove("testpassive", arg, arg);
    	} catch(e) {
    		
    	} /* */

    	return result;
    })();

    function instance$3($$self, $$props, $$invalidate) {
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("VirtualList", slots, ['header','item','footer']);
    	let { height } = $$props;
    	let { width = "100%" } = $$props;
    	let { itemCount } = $$props;
    	let { itemSize } = $$props;
    	let { estimatedItemSize = null } = $$props;
    	let { stickyIndices = null } = $$props;
    	let { scrollDirection = DIRECTION.VERTICAL } = $$props;
    	let { scrollOffset = null } = $$props;
    	let { scrollToIndex = null } = $$props;
    	let { scrollToAlignment = null } = $$props;
    	let { overscanCount = 3 } = $$props;
    	const dispatchEvent = createEventDispatcher();

    	const sizeAndPositionManager = new SizeAndPositionManager({
    			itemCount,
    			itemSize,
    			estimatedItemSize: getEstimatedItemSize()
    		});

    	let mounted = false;
    	let wrapper;
    	let items = [];

    	let state = {
    		offset: scrollOffset || scrollToIndex != null && getOffsetForIndex(scrollToIndex) || 0,
    		scrollChangeReason: SCROLL_CHANGE_REASON.REQUESTED
    	};

    	let prevState = state;

    	let prevProps = {
    		scrollToIndex,
    		scrollToAlignment,
    		scrollOffset,
    		itemCount,
    		itemSize,
    		estimatedItemSize
    	};

    	let styleCache = {};
    	let wrapperStyle = "";
    	let innerStyle = "";
    	refresh(); // Initial Load

    	onMount(() => {
    		$$invalidate(19, mounted = true);
    		wrapper.addEventListener("scroll", handleScroll, thirdEventArg);

    		if (scrollOffset != null) {
    			scrollTo(scrollOffset);
    		} else if (scrollToIndex != null) {
    			scrollTo(getOffsetForIndex(scrollToIndex));
    		}
    	});

    	onDestroy(() => {
    		if (mounted) wrapper.removeEventListener("scroll", handleScroll);
    	});

    	function propsUpdated() {
    		if (!mounted) return;
    		const scrollPropsHaveChanged = prevProps.scrollToIndex !== scrollToIndex || prevProps.scrollToAlignment !== scrollToAlignment;
    		const itemPropsHaveChanged = prevProps.itemCount !== itemCount || prevProps.itemSize !== itemSize || prevProps.estimatedItemSize !== estimatedItemSize;

    		if (itemPropsHaveChanged) {
    			sizeAndPositionManager.updateConfig({
    				itemSize,
    				itemCount,
    				estimatedItemSize: getEstimatedItemSize()
    			});

    			recomputeSizes();
    		}

    		if (prevProps.scrollOffset !== scrollOffset) {
    			$$invalidate(20, state = {
    				offset: scrollOffset || 0,
    				scrollChangeReason: SCROLL_CHANGE_REASON.REQUESTED
    			});
    		} else if (typeof scrollToIndex === "number" && (scrollPropsHaveChanged || itemPropsHaveChanged)) {
    			$$invalidate(20, state = {
    				offset: getOffsetForIndex(scrollToIndex, scrollToAlignment, itemCount),
    				scrollChangeReason: SCROLL_CHANGE_REASON.REQUESTED
    			});
    		}

    		prevProps = {
    			scrollToIndex,
    			scrollToAlignment,
    			scrollOffset,
    			itemCount,
    			itemSize,
    			estimatedItemSize
    		};
    	}

    	function stateUpdated() {
    		if (!mounted) return;
    		const { offset, scrollChangeReason } = state;

    		if (prevState.offset !== offset || prevState.scrollChangeReason !== scrollChangeReason) {
    			refresh();
    		}

    		if (prevState.offset !== offset && scrollChangeReason === SCROLL_CHANGE_REASON.REQUESTED) {
    			scrollTo(offset);
    		}

    		prevState = state;
    	}

    	function refresh() {
    		const { offset } = state;

    		const { start, stop } = sizeAndPositionManager.getVisibleRange({
    			containerSize: scrollDirection === DIRECTION.VERTICAL ? height : width,
    			offset,
    			overscanCount
    		});

    		let updatedItems = [];
    		const totalSize = sizeAndPositionManager.getTotalSize();

    		if (scrollDirection === DIRECTION.VERTICAL) {
    			$$invalidate(2, wrapperStyle = `height:${height}px;width:${width};`);
    			$$invalidate(3, innerStyle = `flex-direction:column;height:${totalSize}px;`);
    		} else {
    			$$invalidate(2, wrapperStyle = `height:${height};width:${width}px`);
    			$$invalidate(3, innerStyle = `width:${totalSize}px;`);
    		}

    		const hasStickyIndices = stickyIndices != null && stickyIndices.length !== 0;

    		if (hasStickyIndices) {
    			for (let i = 0; i < stickyIndices.length; i++) {
    				const index = stickyIndices[i];
    				updatedItems.push({ index, style: getStyle(index, true) });
    			}
    		}

    		if (start !== undefined && stop !== undefined) {
    			for (let index = start; index <= stop; index++) {
    				if (hasStickyIndices && stickyIndices.includes(index)) {
    					continue;
    				}

    				updatedItems.push({ index, style: getStyle(index, false) });
    			}

    			dispatchEvent("itemsUpdated", { startIndex: start, stopIndex: stop });
    		}

    		$$invalidate(1, items = updatedItems);
    	}

    	function scrollTo(value) {
    		$$invalidate(0, wrapper[SCROLL_PROP[scrollDirection]] = value, wrapper);
    	}

    	function recomputeSizes(startIndex = 0) {
    		styleCache = {};
    		sizeAndPositionManager.resetItem(startIndex);
    		refresh();
    	}

    	function getOffsetForIndex(index, align = scrollToAlignment, _itemCount = itemCount) {
    		if (index < 0 || index >= _itemCount) {
    			index = 0;
    		}

    		return sizeAndPositionManager.getUpdatedOffsetForIndex({
    			align,
    			containerSize: scrollDirection === DIRECTION.VERTICAL ? height : width,
    			currentOffset: state ? state.offset : 0,
    			targetIndex: index
    		});
    	}

    	function handleScroll(event) {
    		const offset = getWrapperOffset();
    		if (offset < 0 || state.offset === offset || event.target !== wrapper) return;

    		$$invalidate(20, state = {
    			offset,
    			scrollChangeReason: SCROLL_CHANGE_REASON.OBSERVED
    		});

    		dispatchEvent("afterScroll", { offset, event });
    	}

    	function getWrapperOffset() {
    		return wrapper[SCROLL_PROP[scrollDirection]];
    	}

    	function getEstimatedItemSize() {
    		return estimatedItemSize || typeof itemSize === "number" && itemSize || 50;
    	}

    	function getStyle(index, sticky) {
    		if (styleCache[index]) return styleCache[index];
    		const { size, offset } = sizeAndPositionManager.getSizeAndPositionForIndex(index);
    		let style;

    		if (scrollDirection === DIRECTION.VERTICAL) {
    			style = `left:0;width:100%;height:${size}px;`;

    			if (sticky) {
    				style += `position:sticky;flex-grow:0;z-index:1;top:0;margin-top:${offset}px;margin-bottom:${-(offset + size)}px;`;
    			} else {
    				style += `position:absolute;top:${offset}px;`;
    			}
    		} else {
    			style = `top:0;width:${size}px;`;

    			if (sticky) {
    				style += `position:sticky;z-index:1;left:0;margin-left:${offset}px;margin-right:${-(offset + size)}px;`;
    			} else {
    				style += `position:absolute;height:100%;left:${offset}px;`;
    			}
    		}

    		return styleCache[index] = style;
    	}

    	const writable_props = [
    		"height",
    		"width",
    		"itemCount",
    		"itemSize",
    		"estimatedItemSize",
    		"stickyIndices",
    		"scrollDirection",
    		"scrollOffset",
    		"scrollToIndex",
    		"scrollToAlignment",
    		"overscanCount"
    	];

    	Object_1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<VirtualList> was created with unknown prop '${key}'`);
    	});

    	function div1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			wrapper = $$value;
    			$$invalidate(0, wrapper);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ("height" in $$props) $$invalidate(4, height = $$props.height);
    		if ("width" in $$props) $$invalidate(5, width = $$props.width);
    		if ("itemCount" in $$props) $$invalidate(6, itemCount = $$props.itemCount);
    		if ("itemSize" in $$props) $$invalidate(7, itemSize = $$props.itemSize);
    		if ("estimatedItemSize" in $$props) $$invalidate(8, estimatedItemSize = $$props.estimatedItemSize);
    		if ("stickyIndices" in $$props) $$invalidate(9, stickyIndices = $$props.stickyIndices);
    		if ("scrollDirection" in $$props) $$invalidate(10, scrollDirection = $$props.scrollDirection);
    		if ("scrollOffset" in $$props) $$invalidate(11, scrollOffset = $$props.scrollOffset);
    		if ("scrollToIndex" in $$props) $$invalidate(12, scrollToIndex = $$props.scrollToIndex);
    		if ("scrollToAlignment" in $$props) $$invalidate(13, scrollToAlignment = $$props.scrollToAlignment);
    		if ("overscanCount" in $$props) $$invalidate(14, overscanCount = $$props.overscanCount);
    		if ("$$scope" in $$props) $$invalidate(16, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		thirdEventArg,
    		onMount,
    		onDestroy,
    		createEventDispatcher,
    		SizeAndPositionManager,
    		DIRECTION,
    		SCROLL_CHANGE_REASON,
    		SCROLL_PROP,
    		height,
    		width,
    		itemCount,
    		itemSize,
    		estimatedItemSize,
    		stickyIndices,
    		scrollDirection,
    		scrollOffset,
    		scrollToIndex,
    		scrollToAlignment,
    		overscanCount,
    		dispatchEvent,
    		sizeAndPositionManager,
    		mounted,
    		wrapper,
    		items,
    		state,
    		prevState,
    		prevProps,
    		styleCache,
    		wrapperStyle,
    		innerStyle,
    		propsUpdated,
    		stateUpdated,
    		refresh,
    		scrollTo,
    		recomputeSizes,
    		getOffsetForIndex,
    		handleScroll,
    		getWrapperOffset,
    		getEstimatedItemSize,
    		getStyle
    	});

    	$$self.$inject_state = $$props => {
    		if ("height" in $$props) $$invalidate(4, height = $$props.height);
    		if ("width" in $$props) $$invalidate(5, width = $$props.width);
    		if ("itemCount" in $$props) $$invalidate(6, itemCount = $$props.itemCount);
    		if ("itemSize" in $$props) $$invalidate(7, itemSize = $$props.itemSize);
    		if ("estimatedItemSize" in $$props) $$invalidate(8, estimatedItemSize = $$props.estimatedItemSize);
    		if ("stickyIndices" in $$props) $$invalidate(9, stickyIndices = $$props.stickyIndices);
    		if ("scrollDirection" in $$props) $$invalidate(10, scrollDirection = $$props.scrollDirection);
    		if ("scrollOffset" in $$props) $$invalidate(11, scrollOffset = $$props.scrollOffset);
    		if ("scrollToIndex" in $$props) $$invalidate(12, scrollToIndex = $$props.scrollToIndex);
    		if ("scrollToAlignment" in $$props) $$invalidate(13, scrollToAlignment = $$props.scrollToAlignment);
    		if ("overscanCount" in $$props) $$invalidate(14, overscanCount = $$props.overscanCount);
    		if ("mounted" in $$props) $$invalidate(19, mounted = $$props.mounted);
    		if ("wrapper" in $$props) $$invalidate(0, wrapper = $$props.wrapper);
    		if ("items" in $$props) $$invalidate(1, items = $$props.items);
    		if ("state" in $$props) $$invalidate(20, state = $$props.state);
    		if ("prevState" in $$props) prevState = $$props.prevState;
    		if ("prevProps" in $$props) prevProps = $$props.prevProps;
    		if ("styleCache" in $$props) styleCache = $$props.styleCache;
    		if ("wrapperStyle" in $$props) $$invalidate(2, wrapperStyle = $$props.wrapperStyle);
    		if ("innerStyle" in $$props) $$invalidate(3, innerStyle = $$props.innerStyle);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*scrollToIndex, scrollToAlignment, scrollOffset, itemCount, itemSize, estimatedItemSize*/ 14784) {
    			 propsUpdated();
    		}

    		if ($$self.$$.dirty[0] & /*state*/ 1048576) {
    			 stateUpdated();
    		}

    		if ($$self.$$.dirty[0] & /*mounted, height, width, stickyIndices*/ 524848) {
    			 if (mounted) recomputeSizes(height); // call scroll.reset;
    		}
    	};

    	return [
    		wrapper,
    		items,
    		wrapperStyle,
    		innerStyle,
    		height,
    		width,
    		itemCount,
    		itemSize,
    		estimatedItemSize,
    		stickyIndices,
    		scrollDirection,
    		scrollOffset,
    		scrollToIndex,
    		scrollToAlignment,
    		overscanCount,
    		recomputeSizes,
    		$$scope,
    		slots,
    		div1_binding
    	];
    }

    class VirtualList extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance$3,
    			create_fragment$3,
    			safe_not_equal,
    			{
    				height: 4,
    				width: 5,
    				itemCount: 6,
    				itemSize: 7,
    				estimatedItemSize: 8,
    				stickyIndices: 9,
    				scrollDirection: 10,
    				scrollOffset: 11,
    				scrollToIndex: 12,
    				scrollToAlignment: 13,
    				overscanCount: 14,
    				recomputeSizes: 15
    			},
    			[-1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "VirtualList",
    			options,
    			id: create_fragment$3.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*height*/ ctx[4] === undefined && !("height" in props)) {
    			console.warn("<VirtualList> was created without expected prop 'height'");
    		}

    		if (/*itemCount*/ ctx[6] === undefined && !("itemCount" in props)) {
    			console.warn("<VirtualList> was created without expected prop 'itemCount'");
    		}

    		if (/*itemSize*/ ctx[7] === undefined && !("itemSize" in props)) {
    			console.warn("<VirtualList> was created without expected prop 'itemSize'");
    		}
    	}

    	get height() {
    		throw new Error("<VirtualList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set height(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get width() {
    		throw new Error("<VirtualList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set width(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get itemCount() {
    		throw new Error("<VirtualList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set itemCount(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get itemSize() {
    		throw new Error("<VirtualList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set itemSize(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get estimatedItemSize() {
    		throw new Error("<VirtualList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set estimatedItemSize(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get stickyIndices() {
    		throw new Error("<VirtualList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set stickyIndices(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get scrollDirection() {
    		throw new Error("<VirtualList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set scrollDirection(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get scrollOffset() {
    		throw new Error("<VirtualList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set scrollOffset(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get scrollToIndex() {
    		throw new Error("<VirtualList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set scrollToIndex(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get scrollToAlignment() {
    		throw new Error("<VirtualList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set scrollToAlignment(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get overscanCount() {
    		throw new Error("<VirtualList>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set overscanCount(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get recomputeSizes() {
    		return this.$$.ctx[15];
    	}

    	set recomputeSizes(value) {
    		throw new Error("<VirtualList>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\Svelecte\components\Dropdown.svelte generated by Svelte v3.25.0 */
    const file$4 = "src\\Svelecte\\components\\Dropdown.svelte";

    function get_each_context$2(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[38] = list[i];
    	child_ctx[40] = i;
    	return child_ctx;
    }

    // (131:2) {#if items.length}
    function create_if_block_3$1(ctx) {
    	let current_block_type_index;
    	let if_block;
    	let if_block_anchor;
    	let current;
    	const if_block_creators = [create_if_block_4, create_else_block$2];
    	const if_blocks = [];

    	function select_block_type(ctx, dirty) {
    		if (/*virtualList*/ ctx[5]) return 0;
    		return 1;
    	}

    	current_block_type_index = select_block_type(ctx);
    	if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);

    	const block = {
    		c: function create() {
    			if_block.c();
    			if_block_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			if_blocks[current_block_type_index].m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			let previous_block_index = current_block_type_index;
    			current_block_type_index = select_block_type(ctx);

    			if (current_block_type_index === previous_block_index) {
    				if_blocks[current_block_type_index].p(ctx, dirty);
    			} else {
    				group_outros();

    				transition_out(if_blocks[previous_block_index], 1, 1, () => {
    					if_blocks[previous_block_index] = null;
    				});

    				check_outros();
    				if_block = if_blocks[current_block_type_index];

    				if (!if_block) {
    					if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
    					if_block.c();
    				}

    				transition_in(if_block, 1);
    				if_block.m(if_block_anchor.parentNode, if_block_anchor);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if_blocks[current_block_type_index].d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_3$1.name,
    		type: "if",
    		source: "(131:2) {#if items.length}",
    		ctx
    	});

    	return block;
    }

    // (152:4) {:else}
    function create_else_block$2(ctx) {
    	let each_1_anchor;
    	let current;
    	let each_value = /*items*/ ctx[4];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$2(get_each_context$2(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	const block = {
    		c: function create() {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			each_1_anchor = empty();
    		},
    		m: function mount(target, anchor) {
    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(target, anchor);
    			}

    			insert_dev(target, each_1_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*listIndex, dropdownIndex, renderer, items, $inputValue*/ 131225) {
    				each_value = /*items*/ ctx[4];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$2(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block$2(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(each_1_anchor.parentNode, each_1_anchor);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			current = true;
    		},
    		o: function outro(local) {
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_each(each_blocks, detaching);
    			if (detaching) detach_dev(each_1_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_else_block$2.name,
    		type: "else",
    		source: "(152:4) {:else}",
    		ctx
    	});

    	return block;
    }

    // (132:4) {#if virtualList}
    function create_if_block_4(ctx) {
    	let virtuallist;
    	let current;

    	let virtuallist_props = {
    		width: "100%",
    		height: Math.min(/*vl_height*/ ctx[14], Array.isArray(/*vl_itemSize*/ ctx[15])
    		? /*vl_height*/ ctx[14]
    		: /*items*/ ctx[4].length * /*vl_itemSize*/ ctx[15]),
    		itemCount: /*items*/ ctx[4].length,
    		itemSize: /*vl_itemSize*/ ctx[15],
    		scrollToAlignment: "auto",
    		scrollToIndex: /*items*/ ctx[4].length && /*isMounted*/ ctx[12]
    		? /*dropdownIndex*/ ctx[0]
    		: null,
    		$$slots: {
    			item: [
    				create_item_slot,
    				({ index, style }) => ({ 36: index, 37: style }),
    				({ index, style }) => [0, (index ? 32 : 0) | (style ? 64 : 0)]
    			]
    		},
    		$$scope: { ctx }
    	};

    	virtuallist = new VirtualList({ props: virtuallist_props, $$inline: true });
    	/*virtuallist_binding*/ ctx[27](virtuallist);

    	const block = {
    		c: function create() {
    			create_component(virtuallist.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(virtuallist, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const virtuallist_changes = {};

    			if (dirty[0] & /*vl_height, vl_itemSize, items*/ 49168) virtuallist_changes.height = Math.min(/*vl_height*/ ctx[14], Array.isArray(/*vl_itemSize*/ ctx[15])
    			? /*vl_height*/ ctx[14]
    			: /*items*/ ctx[4].length * /*vl_itemSize*/ ctx[15]);

    			if (dirty[0] & /*items*/ 16) virtuallist_changes.itemCount = /*items*/ ctx[4].length;
    			if (dirty[0] & /*vl_itemSize*/ 32768) virtuallist_changes.itemSize = /*vl_itemSize*/ ctx[15];

    			if (dirty[0] & /*items, isMounted, dropdownIndex*/ 4113) virtuallist_changes.scrollToIndex = /*items*/ ctx[4].length && /*isMounted*/ ctx[12]
    			? /*dropdownIndex*/ ctx[0]
    			: null;

    			if (dirty[0] & /*dropdownIndex, renderer, listIndex, items, $inputValue*/ 131225 | dirty[1] & /*$$scope, style, index*/ 1120) {
    				virtuallist_changes.$$scope = { dirty, ctx };
    			}

    			virtuallist.$set(virtuallist_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(virtuallist.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(virtuallist.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			/*virtuallist_binding*/ ctx[27](null);
    			destroy_component(virtuallist, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_4.name,
    		type: "if",
    		source: "(132:4) {#if virtualList}",
    		ctx
    	});

    	return block;
    }

    // (153:6) {#each items as opt, i}
    function create_each_block$2(ctx) {
    	let div;
    	let item;
    	let t;
    	let div_data_pos_value;
    	let current;

    	item = new Item({
    			props: {
    				formatter: /*renderer*/ ctx[3],
    				index: /*listIndex*/ ctx[7].map[/*i*/ ctx[40]],
    				isDisabled: /*opt*/ ctx[38].isDisabled,
    				item: /*opt*/ ctx[38],
    				inputValue: /*$inputValue*/ ctx[17]
    			},
    			$$inline: true
    		});

    	item.$on("hover", /*hover_handler_1*/ ctx[28]);
    	item.$on("select", /*select_handler_1*/ ctx[29]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(item.$$.fragment);
    			t = space();
    			attr_dev(div, "data-pos", div_data_pos_value = /*listIndex*/ ctx[7].map[/*i*/ ctx[40]]);
    			toggle_class(div, "sv-dd-item-active", /*listIndex*/ ctx[7].map[/*i*/ ctx[40]] === /*dropdownIndex*/ ctx[0]);
    			add_location(div, file$4, 153, 8, 5801);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(item, div, null);
    			append_dev(div, t);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const item_changes = {};
    			if (dirty[0] & /*renderer*/ 8) item_changes.formatter = /*renderer*/ ctx[3];
    			if (dirty[0] & /*listIndex*/ 128) item_changes.index = /*listIndex*/ ctx[7].map[/*i*/ ctx[40]];
    			if (dirty[0] & /*items*/ 16) item_changes.isDisabled = /*opt*/ ctx[38].isDisabled;
    			if (dirty[0] & /*items*/ 16) item_changes.item = /*opt*/ ctx[38];
    			if (dirty[0] & /*$inputValue*/ 131072) item_changes.inputValue = /*$inputValue*/ ctx[17];

    			if (dirty[1] & /*$$scope*/ 1024) {
    				item_changes.$$scope = { dirty, ctx };
    			}

    			item.$set(item_changes);

    			if (!current || dirty[0] & /*listIndex*/ 128 && div_data_pos_value !== (div_data_pos_value = /*listIndex*/ ctx[7].map[/*i*/ ctx[40]])) {
    				attr_dev(div, "data-pos", div_data_pos_value);
    			}

    			if (dirty[0] & /*listIndex, dropdownIndex*/ 129) {
    				toggle_class(div, "sv-dd-item-active", /*listIndex*/ ctx[7].map[/*i*/ ctx[40]] === /*dropdownIndex*/ ctx[0]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(item.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(item.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(item);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$2.name,
    		type: "each",
    		source: "(153:6) {#each items as opt, i}",
    		ctx
    	});

    	return block;
    }

    // (141:8) <div slot="item" let:index let:style {style} class:sv-dd-item-active={index === dropdownIndex}>
    function create_item_slot(ctx) {
    	let div;
    	let item;
    	let div_style_value;
    	let current;

    	item = new Item({
    			props: {
    				formatter: /*renderer*/ ctx[3],
    				index: /*listIndex*/ ctx[7].map[/*index*/ ctx[36]],
    				isDisabled: /*items*/ ctx[4][/*index*/ ctx[36]].isDisabled,
    				item: /*items*/ ctx[4][/*index*/ ctx[36]],
    				inputValue: /*$inputValue*/ ctx[17]
    			},
    			$$inline: true
    		});

    	item.$on("hover", /*hover_handler*/ ctx[25]);
    	item.$on("select", /*select_handler*/ ctx[26]);

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(item.$$.fragment);
    			attr_dev(div, "slot", "item");
    			attr_dev(div, "style", div_style_value = /*style*/ ctx[37]);
    			toggle_class(div, "sv-dd-item-active", /*index*/ ctx[36] === /*dropdownIndex*/ ctx[0]);
    			add_location(div, file$4, 140, 8, 5348);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(item, div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const item_changes = {};
    			if (dirty[0] & /*renderer*/ 8) item_changes.formatter = /*renderer*/ ctx[3];
    			if (dirty[0] & /*listIndex*/ 128 | dirty[1] & /*index*/ 32) item_changes.index = /*listIndex*/ ctx[7].map[/*index*/ ctx[36]];
    			if (dirty[0] & /*items*/ 16 | dirty[1] & /*index*/ 32) item_changes.isDisabled = /*items*/ ctx[4][/*index*/ ctx[36]].isDisabled;
    			if (dirty[0] & /*items*/ 16 | dirty[1] & /*index*/ 32) item_changes.item = /*items*/ ctx[4][/*index*/ ctx[36]];
    			if (dirty[0] & /*$inputValue*/ 131072) item_changes.inputValue = /*$inputValue*/ ctx[17];

    			if (dirty[1] & /*$$scope*/ 1024) {
    				item_changes.$$scope = { dirty, ctx };
    			}

    			item.$set(item_changes);

    			if (!current || dirty[1] & /*style*/ 64 && div_style_value !== (div_style_value = /*style*/ ctx[37])) {
    				attr_dev(div, "style", div_style_value);
    			}

    			if (dirty[0] & /*dropdownIndex*/ 1 | dirty[1] & /*index*/ 32) {
    				toggle_class(div, "sv-dd-item-active", /*index*/ ctx[36] === /*dropdownIndex*/ ctx[0]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(item.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(item.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(item);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_item_slot.name,
    		type: "slot",
    		source: "(141:8) <div slot=\\\"item\\\" let:index let:style {style} class:sv-dd-item-active={index === dropdownIndex}>",
    		ctx
    	});

    	return block;
    }

    // (167:2) {#if $inputValue && creatable && !maxReached}
    function create_if_block_1$2(ctx) {
    	let div;
    	let span;
    	let t0;
    	let t1;
    	let t2;
    	let t3;
    	let mounted;
    	let dispose;
    	let if_block = /*currentListLength*/ ctx[20] !== /*dropdownIndex*/ ctx[0] && create_if_block_2$1(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			span = element("span");
    			t0 = text("Create '");
    			t1 = text(/*$inputValue*/ ctx[17]);
    			t2 = text("'");
    			t3 = space();
    			if (if_block) if_block.c();
    			add_location(span, file$4, 168, 6, 6374);
    			attr_dev(div, "class", "creatable-row svelte-2nw4gl");
    			toggle_class(div, "active", /*currentListLength*/ ctx[20] === /*dropdownIndex*/ ctx[0]);
    			add_location(div, file$4, 167, 4, 6245);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, span);
    			append_dev(span, t0);
    			append_dev(span, t1);
    			append_dev(span, t2);
    			append_dev(div, t3);
    			if (if_block) if_block.m(div, null);

    			if (!mounted) {
    				dispose = listen_dev(
    					div,
    					"click",
    					function () {
    						if (is_function(/*dispatch*/ ctx[19]("select", /*$inputValue*/ ctx[17]))) /*dispatch*/ ctx[19]("select", /*$inputValue*/ ctx[17]).apply(this, arguments);
    					},
    					false,
    					false,
    					false
    				);

    				mounted = true;
    			}
    		},
    		p: function update(new_ctx, dirty) {
    			ctx = new_ctx;
    			if (dirty[0] & /*$inputValue*/ 131072) set_data_dev(t1, /*$inputValue*/ ctx[17]);

    			if (/*currentListLength*/ ctx[20] !== /*dropdownIndex*/ ctx[0]) {
    				if (if_block) ; else {
    					if_block = create_if_block_2$1(ctx);
    					if_block.c();
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty[0] & /*currentListLength, dropdownIndex*/ 1048577) {
    				toggle_class(div, "active", /*currentListLength*/ ctx[20] === /*dropdownIndex*/ ctx[0]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block) if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1$2.name,
    		type: "if",
    		source: "(167:2) {#if $inputValue && creatable && !maxReached}",
    		ctx
    	});

    	return block;
    }

    // (170:6) {#if currentListLength !== dropdownIndex}
    function create_if_block_2$1(ctx) {
    	let span;
    	let kbd0;
    	let t1;
    	let kbd1;

    	const block = {
    		c: function create() {
    			span = element("span");
    			kbd0 = element("kbd");
    			kbd0.textContent = "Ctrl";
    			t1 = text("+");
    			kbd1 = element("kbd");
    			kbd1.textContent = "Enter";
    			attr_dev(kbd0, "class", "svelte-2nw4gl");
    			add_location(kbd0, file$4, 170, 29, 6489);
    			attr_dev(kbd1, "class", "svelte-2nw4gl");
    			add_location(kbd1, file$4, 170, 45, 6505);
    			attr_dev(span, "class", "shortcut svelte-2nw4gl");
    			add_location(span, file$4, 170, 6, 6466);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, span, anchor);
    			append_dev(span, kbd0);
    			append_dev(span, t1);
    			append_dev(span, kbd1);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(span);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_2$1.name,
    		type: "if",
    		source: "(170:6) {#if currentListLength !== dropdownIndex}",
    		ctx
    	});

    	return block;
    }

    // (175:2) {#if hasEmptyList || maxReached}
    function create_if_block$2(ctx) {
    	let div;
    	let t;

    	const block = {
    		c: function create() {
    			div = element("div");
    			t = text(/*listMessage*/ ctx[9]);
    			attr_dev(div, "class", "empty-list-row svelte-2nw4gl");
    			add_location(div, file$4, 175, 4, 6604);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*listMessage*/ 512) set_data_dev(t, /*listMessage*/ ctx[9]);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(175:2) {#if hasEmptyList || maxReached}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let div1;
    	let div0;
    	let t0;
    	let t1;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*items*/ ctx[4].length && create_if_block_3$1(ctx);
    	let if_block1 = /*$inputValue*/ ctx[17] && /*creatable*/ ctx[1] && !/*maxReached*/ ctx[2] && create_if_block_1$2(ctx);
    	let if_block2 = (/*hasEmptyList*/ ctx[13] || /*maxReached*/ ctx[2]) && create_if_block$2(ctx);

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			if (if_block0) if_block0.c();
    			t0 = space();
    			if (if_block1) if_block1.c();
    			t1 = space();
    			if (if_block2) if_block2.c();
    			attr_dev(div0, "class", "sv-dropdown-content svelte-2nw4gl");
    			toggle_class(div0, "max-reached", /*maxReached*/ ctx[2]);
    			add_location(div0, file$4, 129, 2, 4847);
    			attr_dev(div1, "class", "sv-dropdown svelte-2nw4gl");
    			attr_dev(div1, "aria-expanded", /*$hasDropdownOpened*/ ctx[18]);
    			attr_dev(div1, "tabindex", "-1");
    			toggle_class(div1, "is-virtual", /*virtualList*/ ctx[5]);
    			add_location(div1, file$4, 125, 0, 4673);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			if (if_block0) if_block0.m(div0, null);
    			append_dev(div0, t0);
    			if (if_block1) if_block1.m(div0, null);
    			append_dev(div0, t1);
    			if (if_block2) if_block2.m(div0, null);
    			/*div0_binding*/ ctx[30](div0);
    			/*div1_binding*/ ctx[31](div1);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div1, "mousedown", prevent_default(/*mousedown_handler*/ ctx[24]), false, true, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (/*items*/ ctx[4].length) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);

    					if (dirty[0] & /*items*/ 16) {
    						transition_in(if_block0, 1);
    					}
    				} else {
    					if_block0 = create_if_block_3$1(ctx);
    					if_block0.c();
    					transition_in(if_block0, 1);
    					if_block0.m(div0, t0);
    				}
    			} else if (if_block0) {
    				group_outros();

    				transition_out(if_block0, 1, 1, () => {
    					if_block0 = null;
    				});

    				check_outros();
    			}

    			if (/*$inputValue*/ ctx[17] && /*creatable*/ ctx[1] && !/*maxReached*/ ctx[2]) {
    				if (if_block1) {
    					if_block1.p(ctx, dirty);
    				} else {
    					if_block1 = create_if_block_1$2(ctx);
    					if_block1.c();
    					if_block1.m(div0, t1);
    				}
    			} else if (if_block1) {
    				if_block1.d(1);
    				if_block1 = null;
    			}

    			if (/*hasEmptyList*/ ctx[13] || /*maxReached*/ ctx[2]) {
    				if (if_block2) {
    					if_block2.p(ctx, dirty);
    				} else {
    					if_block2 = create_if_block$2(ctx);
    					if_block2.c();
    					if_block2.m(div0, null);
    				}
    			} else if (if_block2) {
    				if_block2.d(1);
    				if_block2 = null;
    			}

    			if (dirty[0] & /*maxReached*/ 4) {
    				toggle_class(div0, "max-reached", /*maxReached*/ ctx[2]);
    			}

    			if (!current || dirty[0] & /*$hasDropdownOpened*/ 262144) {
    				attr_dev(div1, "aria-expanded", /*$hasDropdownOpened*/ ctx[18]);
    			}

    			if (dirty[0] & /*virtualList*/ 32) {
    				toggle_class(div1, "is-virtual", /*virtualList*/ ctx[5]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block0);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    			if (if_block0) if_block0.d();
    			if (if_block1) if_block1.d();
    			if (if_block2) if_block2.d();
    			/*div0_binding*/ ctx[30](null);
    			/*div1_binding*/ ctx[31](null);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let $inputValue,
    		$$unsubscribe_inputValue = noop,
    		$$subscribe_inputValue = () => ($$unsubscribe_inputValue(), $$unsubscribe_inputValue = subscribe(inputValue, $$value => $$invalidate(17, $inputValue = $$value)), inputValue);

    	let $hasDropdownOpened,
    		$$unsubscribe_hasDropdownOpened = noop,
    		$$subscribe_hasDropdownOpened = () => ($$unsubscribe_hasDropdownOpened(), $$unsubscribe_hasDropdownOpened = subscribe(hasDropdownOpened, $$value => $$invalidate(18, $hasDropdownOpened = $$value)), hasDropdownOpened);

    	$$self.$$.on_destroy.push(() => $$unsubscribe_inputValue());
    	$$self.$$.on_destroy.push(() => $$unsubscribe_hasDropdownOpened());
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Dropdown", slots, []);
    	let { creatable } = $$props;
    	let { maxReached = false } = $$props;
    	let { dropdownIndex = 0 } = $$props;
    	let { renderer } = $$props;
    	let { items = [] } = $$props;
    	let { virtualList } = $$props;
    	let { vlItemSize } = $$props;
    	let { vlHeight } = $$props;
    	let { inputValue } = $$props;
    	validate_store(inputValue, "inputValue");
    	$$subscribe_inputValue();
    	let { listIndex } = $$props;
    	let { hasDropdownOpened } = $$props;
    	validate_store(hasDropdownOpened, "hasDropdownOpened");
    	$$subscribe_hasDropdownOpened();
    	let { listMessage } = $$props;

    	function scrollIntoView(params) {
    		if (virtualList) return;
    		const focusedEl = container.querySelector(`[data-pos="${dropdownIndex}"]`);
    		if (!focusedEl) return;
    		const focusedRect = focusedEl.getBoundingClientRect();
    		const menuRect = scrollContainer.getBoundingClientRect();
    		const overScroll = focusedEl.offsetHeight / 3;

    		switch (true) {
    			case focusedEl.offsetTop < scrollContainer.scrollTop:
    				$$invalidate(11, scrollContainer.scrollTop = focusedEl.offsetTop - overScroll, scrollContainer);
    				break;
    			case focusedEl.offsetTop + focusedRect.height > scrollContainer.scrollTop + menuRect.height:
    				$$invalidate(11, scrollContainer.scrollTop = focusedEl.offsetTop + focusedRect.height - scrollContainer.offsetHeight + overScroll, scrollContainer);
    				break;
    		}
    	}

    	const dispatch = createEventDispatcher();
    	let container;
    	let scrollContainer;
    	let isMounted = false;
    	let hasEmptyList = false;
    	let currentListLength = 0;
    	let vl_height = vlHeight;
    	let vl_itemSize = vlItemSize;
    	let vl_autoMode = vlHeight === null && vlItemSize === null;
    	let refVirtualList;

    	function positionDropdown(val) {
    		if (!scrollContainer) return;
    		const outVp = isOutOfViewport(scrollContainer);

    		if (outVp.bottom && !outVp.top) {
    			$$invalidate(11, scrollContainer.style.bottom = scrollContainer.parentElement.clientHeight + 1 + "px", scrollContainer);
    		} else if (!val || outVp.top) {
    			$$invalidate(11, scrollContainer.style.bottom = "", scrollContainer); // FUTURE: debounce ....
    		}
    	}

    	function virtualListDmensionsResolver() {
    		if (!refVirtualList) return;

    		const pixelGetter = (el, prop) => {
    			const styles = window.getComputedStyle(el);
    			let { groups: { value, unit } } = styles[prop].match(/(?<value>\d+)(?<unit>[a-zA-Z]+)/);
    			value = parseFloat(value);

    			if (unit !== "px") {
    				const el = unit === "rem"
    				? document.documentElement
    				: scrollContainer.parentElement;

    				const multipler = parseFloat(window.getComputedStyle(el).fontSize.match(/\d+/).shift());
    				value = multipler * value;
    			}

    			return value;
    		};

    		$$invalidate(14, vl_height = pixelGetter(scrollContainer, "maxHeight") - pixelGetter(scrollContainer, "paddingTop") - pixelGetter(scrollContainer, "paddingBottom"));

    		// get item size (hacky style)
    		$$invalidate(11, scrollContainer.style = "opacity: 0; display: block", scrollContainer);

    		const firstItem = refVirtualList.$$.ctx[0].firstElementChild.firstElementChild;
    		firstItem.style = "";
    		const firstSize = firstItem.getBoundingClientRect().height;
    		const secondItem = refVirtualList.$$.ctx[0].firstElementChild.firstElementChild.nextElementSibling;
    		secondItem.style = "";
    		const secondSize = secondItem.getBoundingClientRect().height;

    		if (firstSize !== secondSize) {
    			const groupHeaderSize = items[0].$isGroupHeader ? firstSize : secondSize;
    			const regularItemSize = items[0].$isGroupHeader ? secondSize : firstSize;
    			$$invalidate(15, vl_itemSize = items.map(opt => opt.$isGroupHeader ? groupHeaderSize : regularItemSize));
    		} else {
    			$$invalidate(15, vl_itemSize = firstSize);
    		}

    		$$invalidate(11, scrollContainer.style = "", scrollContainer);
    	}

    	let dropdownStateSubscription;

    	/** ************************************ lifecycle */
    	onMount(() => {
    		/** ************************************ flawless UX related tweak */
    		dropdownStateSubscription = hasDropdownOpened.subscribe(val => {
    			tick().then(() => positionDropdown(val));

    			// bind/unbind scroll listener
    			document[val ? "addEventListener" : "removeEventListener"]("scroll", () => positionDropdown(val));
    		});

    		$$invalidate(12, isMounted = true);
    	});

    	onDestroy(() => dropdownStateSubscription());

    	const writable_props = [
    		"creatable",
    		"maxReached",
    		"dropdownIndex",
    		"renderer",
    		"items",
    		"virtualList",
    		"vlItemSize",
    		"vlHeight",
    		"inputValue",
    		"listIndex",
    		"hasDropdownOpened",
    		"listMessage"
    	];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Dropdown> was created with unknown prop '${key}'`);
    	});

    	function mousedown_handler(event) {
    		bubble($$self, event);
    	}

    	function hover_handler(event) {
    		bubble($$self, event);
    	}

    	function select_handler(event) {
    		bubble($$self, event);
    	}

    	function virtuallist_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			refVirtualList = $$value;
    			$$invalidate(16, refVirtualList);
    		});
    	}

    	function hover_handler_1(event) {
    		bubble($$self, event);
    	}

    	function select_handler_1(event) {
    		bubble($$self, event);
    	}

    	function div0_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			container = $$value;
    			$$invalidate(10, container);
    		});
    	}

    	function div1_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			scrollContainer = $$value;
    			$$invalidate(11, scrollContainer);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ("creatable" in $$props) $$invalidate(1, creatable = $$props.creatable);
    		if ("maxReached" in $$props) $$invalidate(2, maxReached = $$props.maxReached);
    		if ("dropdownIndex" in $$props) $$invalidate(0, dropdownIndex = $$props.dropdownIndex);
    		if ("renderer" in $$props) $$invalidate(3, renderer = $$props.renderer);
    		if ("items" in $$props) $$invalidate(4, items = $$props.items);
    		if ("virtualList" in $$props) $$invalidate(5, virtualList = $$props.virtualList);
    		if ("vlItemSize" in $$props) $$invalidate(21, vlItemSize = $$props.vlItemSize);
    		if ("vlHeight" in $$props) $$invalidate(22, vlHeight = $$props.vlHeight);
    		if ("inputValue" in $$props) $$subscribe_inputValue($$invalidate(6, inputValue = $$props.inputValue));
    		if ("listIndex" in $$props) $$invalidate(7, listIndex = $$props.listIndex);
    		if ("hasDropdownOpened" in $$props) $$subscribe_hasDropdownOpened($$invalidate(8, hasDropdownOpened = $$props.hasDropdownOpened));
    		if ("listMessage" in $$props) $$invalidate(9, listMessage = $$props.listMessage);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		onDestroy,
    		onMount,
    		tick,
    		VirtualList,
    		isOutOfViewport,
    		Item,
    		creatable,
    		maxReached,
    		dropdownIndex,
    		renderer,
    		items,
    		virtualList,
    		vlItemSize,
    		vlHeight,
    		inputValue,
    		listIndex,
    		hasDropdownOpened,
    		listMessage,
    		scrollIntoView,
    		dispatch,
    		container,
    		scrollContainer,
    		isMounted,
    		hasEmptyList,
    		currentListLength,
    		vl_height,
    		vl_itemSize,
    		vl_autoMode,
    		refVirtualList,
    		positionDropdown,
    		virtualListDmensionsResolver,
    		dropdownStateSubscription,
    		$inputValue,
    		$hasDropdownOpened
    	});

    	$$self.$inject_state = $$props => {
    		if ("creatable" in $$props) $$invalidate(1, creatable = $$props.creatable);
    		if ("maxReached" in $$props) $$invalidate(2, maxReached = $$props.maxReached);
    		if ("dropdownIndex" in $$props) $$invalidate(0, dropdownIndex = $$props.dropdownIndex);
    		if ("renderer" in $$props) $$invalidate(3, renderer = $$props.renderer);
    		if ("items" in $$props) $$invalidate(4, items = $$props.items);
    		if ("virtualList" in $$props) $$invalidate(5, virtualList = $$props.virtualList);
    		if ("vlItemSize" in $$props) $$invalidate(21, vlItemSize = $$props.vlItemSize);
    		if ("vlHeight" in $$props) $$invalidate(22, vlHeight = $$props.vlHeight);
    		if ("inputValue" in $$props) $$subscribe_inputValue($$invalidate(6, inputValue = $$props.inputValue));
    		if ("listIndex" in $$props) $$invalidate(7, listIndex = $$props.listIndex);
    		if ("hasDropdownOpened" in $$props) $$subscribe_hasDropdownOpened($$invalidate(8, hasDropdownOpened = $$props.hasDropdownOpened));
    		if ("listMessage" in $$props) $$invalidate(9, listMessage = $$props.listMessage);
    		if ("container" in $$props) $$invalidate(10, container = $$props.container);
    		if ("scrollContainer" in $$props) $$invalidate(11, scrollContainer = $$props.scrollContainer);
    		if ("isMounted" in $$props) $$invalidate(12, isMounted = $$props.isMounted);
    		if ("hasEmptyList" in $$props) $$invalidate(13, hasEmptyList = $$props.hasEmptyList);
    		if ("currentListLength" in $$props) $$invalidate(20, currentListLength = $$props.currentListLength);
    		if ("vl_height" in $$props) $$invalidate(14, vl_height = $$props.vl_height);
    		if ("vl_itemSize" in $$props) $$invalidate(15, vl_itemSize = $$props.vl_itemSize);
    		if ("vl_autoMode" in $$props) $$invalidate(33, vl_autoMode = $$props.vl_autoMode);
    		if ("refVirtualList" in $$props) $$invalidate(16, refVirtualList = $$props.refVirtualList);
    		if ("dropdownStateSubscription" in $$props) dropdownStateSubscription = $$props.dropdownStateSubscription;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[0] & /*items, creatable, $inputValue, maxReached, virtualList, isMounted, hasEmptyList*/ 143414) {
    			 {
    				$$invalidate(13, hasEmptyList = items.length < 1 && (creatable ? !$inputValue : true));
    				if (maxReached) $$invalidate(0, dropdownIndex = null);

    				// required when changing item list 'on-the-fly' for VL
    				if (virtualList && isMounted && vl_autoMode) {
    					if (hasEmptyList) $$invalidate(0, dropdownIndex = null);
    					$$invalidate(15, vl_itemSize = 0);
    					tick().then(virtualListDmensionsResolver);
    				}
    			}
    		}
    	};

    	return [
    		dropdownIndex,
    		creatable,
    		maxReached,
    		renderer,
    		items,
    		virtualList,
    		inputValue,
    		listIndex,
    		hasDropdownOpened,
    		listMessage,
    		container,
    		scrollContainer,
    		isMounted,
    		hasEmptyList,
    		vl_height,
    		vl_itemSize,
    		refVirtualList,
    		$inputValue,
    		$hasDropdownOpened,
    		dispatch,
    		currentListLength,
    		vlItemSize,
    		vlHeight,
    		scrollIntoView,
    		mousedown_handler,
    		hover_handler,
    		select_handler,
    		virtuallist_binding,
    		hover_handler_1,
    		select_handler_1,
    		div0_binding,
    		div1_binding
    	];
    }

    class Dropdown extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance$4,
    			create_fragment$4,
    			safe_not_equal,
    			{
    				creatable: 1,
    				maxReached: 2,
    				dropdownIndex: 0,
    				renderer: 3,
    				items: 4,
    				virtualList: 5,
    				vlItemSize: 21,
    				vlHeight: 22,
    				inputValue: 6,
    				listIndex: 7,
    				hasDropdownOpened: 8,
    				listMessage: 9,
    				scrollIntoView: 23
    			},
    			[-1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Dropdown",
    			options,
    			id: create_fragment$4.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*creatable*/ ctx[1] === undefined && !("creatable" in props)) {
    			console.warn("<Dropdown> was created without expected prop 'creatable'");
    		}

    		if (/*renderer*/ ctx[3] === undefined && !("renderer" in props)) {
    			console.warn("<Dropdown> was created without expected prop 'renderer'");
    		}

    		if (/*virtualList*/ ctx[5] === undefined && !("virtualList" in props)) {
    			console.warn("<Dropdown> was created without expected prop 'virtualList'");
    		}

    		if (/*vlItemSize*/ ctx[21] === undefined && !("vlItemSize" in props)) {
    			console.warn("<Dropdown> was created without expected prop 'vlItemSize'");
    		}

    		if (/*vlHeight*/ ctx[22] === undefined && !("vlHeight" in props)) {
    			console.warn("<Dropdown> was created without expected prop 'vlHeight'");
    		}

    		if (/*inputValue*/ ctx[6] === undefined && !("inputValue" in props)) {
    			console.warn("<Dropdown> was created without expected prop 'inputValue'");
    		}

    		if (/*listIndex*/ ctx[7] === undefined && !("listIndex" in props)) {
    			console.warn("<Dropdown> was created without expected prop 'listIndex'");
    		}

    		if (/*hasDropdownOpened*/ ctx[8] === undefined && !("hasDropdownOpened" in props)) {
    			console.warn("<Dropdown> was created without expected prop 'hasDropdownOpened'");
    		}

    		if (/*listMessage*/ ctx[9] === undefined && !("listMessage" in props)) {
    			console.warn("<Dropdown> was created without expected prop 'listMessage'");
    		}
    	}

    	get creatable() {
    		throw new Error("<Dropdown>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set creatable(value) {
    		throw new Error("<Dropdown>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get maxReached() {
    		throw new Error("<Dropdown>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set maxReached(value) {
    		throw new Error("<Dropdown>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get dropdownIndex() {
    		throw new Error("<Dropdown>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set dropdownIndex(value) {
    		throw new Error("<Dropdown>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get renderer() {
    		throw new Error("<Dropdown>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set renderer(value) {
    		throw new Error("<Dropdown>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get items() {
    		throw new Error("<Dropdown>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set items(value) {
    		throw new Error("<Dropdown>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get virtualList() {
    		throw new Error("<Dropdown>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set virtualList(value) {
    		throw new Error("<Dropdown>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get vlItemSize() {
    		throw new Error("<Dropdown>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set vlItemSize(value) {
    		throw new Error("<Dropdown>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get vlHeight() {
    		throw new Error("<Dropdown>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set vlHeight(value) {
    		throw new Error("<Dropdown>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get inputValue() {
    		throw new Error("<Dropdown>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set inputValue(value) {
    		throw new Error("<Dropdown>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get listIndex() {
    		throw new Error("<Dropdown>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set listIndex(value) {
    		throw new Error("<Dropdown>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get hasDropdownOpened() {
    		throw new Error("<Dropdown>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set hasDropdownOpened(value) {
    		throw new Error("<Dropdown>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get listMessage() {
    		throw new Error("<Dropdown>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set listMessage(value) {
    		throw new Error("<Dropdown>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get scrollIntoView() {
    		return this.$$.ctx[23];
    	}

    	set scrollIntoView(value) {
    		throw new Error("<Dropdown>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* src\Svelecte\Svelecte.svelte generated by Svelte v3.25.0 */

    const { Object: Object_1$1 } = globals;
    const file$5 = "src\\Svelecte\\Svelecte.svelte";

    function get_each_context$3(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[83] = list[i];
    	return child_ctx;
    }

    const get_icon_slot_changes$1 = dirty => ({});
    const get_icon_slot_context$1 = ctx => ({});

    // (459:4) <div slot="icon" class="icon-slot">
    function create_icon_slot(ctx) {
    	let div;
    	let current;
    	const icon_slot_template = /*#slots*/ ctx[55].icon;
    	const icon_slot = create_slot(icon_slot_template, ctx, /*$$scope*/ ctx[58], get_icon_slot_context$1);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (icon_slot) icon_slot.c();
    			attr_dev(div, "slot", "icon");
    			attr_dev(div, "class", "icon-slot svelte-1h9htsj");
    			add_location(div, file$5, 458, 4, 16173);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			if (icon_slot) {
    				icon_slot.m(div, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (icon_slot) {
    				if (icon_slot.p && dirty[1] & /*$$scope*/ 134217728) {
    					update_slot(icon_slot, icon_slot_template, ctx, /*$$scope*/ ctx[58], dirty, get_icon_slot_changes$1, get_icon_slot_context$1);
    				}
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(icon_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(icon_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (icon_slot) icon_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_icon_slot.name,
    		type: "slot",
    		source: "(459:4) <div slot=\\\"icon\\\" class=\\\"icon-slot\\\">",
    		ctx
    	});

    	return block;
    }

    // (470:2) {#if name && !anchor}
    function create_if_block$3(ctx) {
    	let select;
    	let each_value = /*selectedOptions*/ ctx[22];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block$3(get_each_context$3(ctx, each_value, i));
    	}

    	const block = {
    		c: function create() {
    			select = element("select");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			attr_dev(select, "name", /*name*/ ctx[3]);
    			select.multiple = /*multiple*/ ctx[1];
    			attr_dev(select, "class", "is-hidden svelte-1h9htsj");
    			attr_dev(select, "tabindex", "-1");
    			select.required = /*required*/ ctx[4];
    			select.disabled = /*disabled*/ ctx[2];
    			add_location(select, file$5, 470, 2, 16665);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, select, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(select, null);
    			}
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*selectedOptions, currentValueField, currentLabelField*/ 4980736) {
    				each_value = /*selectedOptions*/ ctx[22];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context$3(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    					} else {
    						each_blocks[i] = create_each_block$3(child_ctx);
    						each_blocks[i].c();
    						each_blocks[i].m(select, null);
    					}
    				}

    				for (; i < each_blocks.length; i += 1) {
    					each_blocks[i].d(1);
    				}

    				each_blocks.length = each_value.length;
    			}

    			if (dirty[0] & /*name*/ 8) {
    				attr_dev(select, "name", /*name*/ ctx[3]);
    			}

    			if (dirty[0] & /*multiple*/ 2) {
    				prop_dev(select, "multiple", /*multiple*/ ctx[1]);
    			}

    			if (dirty[0] & /*required*/ 16) {
    				prop_dev(select, "required", /*required*/ ctx[4]);
    			}

    			if (dirty[0] & /*disabled*/ 4) {
    				prop_dev(select, "disabled", /*disabled*/ ctx[2]);
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(select);
    			destroy_each(each_blocks, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(470:2) {#if name && !anchor}",
    		ctx
    	});

    	return block;
    }

    // (472:4) {#each selectedOptions as opt}
    function create_each_block$3(ctx) {
    	let option;
    	let t_value = /*opt*/ ctx[83][/*currentLabelField*/ ctx[19]] + "";
    	let t;
    	let option_value_value;

    	const block = {
    		c: function create() {
    			option = element("option");
    			t = text(t_value);
    			option.__value = option_value_value = /*opt*/ ctx[83][/*currentValueField*/ ctx[18]];
    			option.value = option.__value;
    			option.selected = true;
    			add_location(option, file$5, 472, 4, 16792);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, option, anchor);
    			append_dev(option, t);
    		},
    		p: function update(ctx, dirty) {
    			if (dirty[0] & /*selectedOptions, currentLabelField*/ 4718592 && t_value !== (t_value = /*opt*/ ctx[83][/*currentLabelField*/ ctx[19]] + "")) set_data_dev(t, t_value);

    			if (dirty[0] & /*selectedOptions, currentValueField*/ 4456448 && option_value_value !== (option_value_value = /*opt*/ ctx[83][/*currentValueField*/ ctx[18]])) {
    				prop_dev(option, "__value", option_value_value);
    				option.value = option.__value;
    			}
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(option);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block$3.name,
    		type: "each",
    		source: "(472:4) {#each selectedOptions as opt}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$5(ctx) {
    	let t0;
    	let t1;
    	let div;
    	let control;
    	let t2;
    	let dropdown;
    	let t3;
    	let div_class_value;
    	let current;

    	let control_props = {
    		renderer: /*itemRenderer*/ ctx[26],
    		disabled: /*disabled*/ ctx[2],
    		clearable: /*clearable*/ ctx[7],
    		searchable: /*searchable*/ ctx[8],
    		placeholder: /*placeholder*/ ctx[9],
    		multiple: /*multiple*/ ctx[1],
    		collapseSelection: /*collapseSelection*/ ctx[5]
    		? config.i18n.collapsedSelection
    		: null,
    		inputValue: /*inputValue*/ ctx[27],
    		hasFocus: /*hasFocus*/ ctx[28],
    		hasDropdownOpened: /*hasDropdownOpened*/ ctx[29],
    		selectedOptions: /*selectedOptions*/ ctx[22],
    		isFetchingData: /*isFetchingData*/ ctx[20],
    		$$slots: { icon: [create_icon_slot] },
    		$$scope: { ctx }
    	};

    	control = new Control({ props: control_props, $$inline: true });
    	/*control_binding*/ ctx[56](control);
    	control.$on("deselect", /*onDeselect*/ ctx[31]);
    	control.$on("keydown", /*onKeyDown*/ ctx[33]);
    	control.$on("paste", /*onPaste*/ ctx[34]);

    	let dropdown_props = {
    		renderer: /*itemRenderer*/ ctx[26],
    		creatable: /*creatable*/ ctx[6],
    		maxReached: /*maxReached*/ ctx[23],
    		virtualList: /*creatable*/ ctx[6] ? false : /*virtualList*/ ctx[10],
    		vlHeight: /*vlHeight*/ ctx[11],
    		vlItemSize: /*vlItemSize*/ ctx[12],
    		dropdownIndex: /*dropdownActiveIndex*/ ctx[17],
    		items: /*availableItems*/ ctx[24],
    		listIndex: /*listIndex*/ ctx[25],
    		inputValue: /*inputValue*/ ctx[27],
    		hasDropdownOpened: /*hasDropdownOpened*/ ctx[29],
    		listMessage: /*listMessage*/ ctx[21]
    	};

    	dropdown = new Dropdown({ props: dropdown_props, $$inline: true });
    	/*dropdown_binding*/ ctx[57](dropdown);
    	dropdown.$on("select", /*onSelect*/ ctx[30]);
    	dropdown.$on("hover", /*onHover*/ ctx[32]);
    	let if_block = /*name*/ ctx[3] && !/*anchor*/ ctx[0] && create_if_block$3(ctx);

    	const block = {
    		c: function create() {
    			t0 = text(/*dropdownActiveIndex*/ ctx[17]);
    			t1 = space();
    			div = element("div");
    			create_component(control.$$.fragment);
    			t2 = space();
    			create_component(dropdown.$$.fragment);
    			t3 = space();
    			if (if_block) if_block.c();
    			attr_dev(div, "class", div_class_value = "" + (null_to_empty(`svelecte ${/*className*/ ctx[13]}`) + " svelte-1h9htsj"));
    			attr_dev(div, "style", /*style*/ ctx[14]);
    			toggle_class(div, "is-disabled", /*disabled*/ ctx[2]);
    			add_location(div, file$5, 450, 0, 15681);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, t0, anchor);
    			insert_dev(target, t1, anchor);
    			insert_dev(target, div, anchor);
    			mount_component(control, div, null);
    			append_dev(div, t2);
    			mount_component(dropdown, div, null);
    			append_dev(div, t3);
    			if (if_block) if_block.m(div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			if (!current || dirty[0] & /*dropdownActiveIndex*/ 131072) set_data_dev(t0, /*dropdownActiveIndex*/ ctx[17]);
    			const control_changes = {};
    			if (dirty[0] & /*itemRenderer*/ 67108864) control_changes.renderer = /*itemRenderer*/ ctx[26];
    			if (dirty[0] & /*disabled*/ 4) control_changes.disabled = /*disabled*/ ctx[2];
    			if (dirty[0] & /*clearable*/ 128) control_changes.clearable = /*clearable*/ ctx[7];
    			if (dirty[0] & /*searchable*/ 256) control_changes.searchable = /*searchable*/ ctx[8];
    			if (dirty[0] & /*placeholder*/ 512) control_changes.placeholder = /*placeholder*/ ctx[9];
    			if (dirty[0] & /*multiple*/ 2) control_changes.multiple = /*multiple*/ ctx[1];

    			if (dirty[0] & /*collapseSelection*/ 32) control_changes.collapseSelection = /*collapseSelection*/ ctx[5]
    			? config.i18n.collapsedSelection
    			: null;

    			if (dirty[0] & /*selectedOptions*/ 4194304) control_changes.selectedOptions = /*selectedOptions*/ ctx[22];
    			if (dirty[0] & /*isFetchingData*/ 1048576) control_changes.isFetchingData = /*isFetchingData*/ ctx[20];

    			if (dirty[1] & /*$$scope*/ 134217728) {
    				control_changes.$$scope = { dirty, ctx };
    			}

    			control.$set(control_changes);
    			const dropdown_changes = {};
    			if (dirty[0] & /*itemRenderer*/ 67108864) dropdown_changes.renderer = /*itemRenderer*/ ctx[26];
    			if (dirty[0] & /*creatable*/ 64) dropdown_changes.creatable = /*creatable*/ ctx[6];
    			if (dirty[0] & /*maxReached*/ 8388608) dropdown_changes.maxReached = /*maxReached*/ ctx[23];
    			if (dirty[0] & /*creatable, virtualList*/ 1088) dropdown_changes.virtualList = /*creatable*/ ctx[6] ? false : /*virtualList*/ ctx[10];
    			if (dirty[0] & /*vlHeight*/ 2048) dropdown_changes.vlHeight = /*vlHeight*/ ctx[11];
    			if (dirty[0] & /*vlItemSize*/ 4096) dropdown_changes.vlItemSize = /*vlItemSize*/ ctx[12];
    			if (dirty[0] & /*dropdownActiveIndex*/ 131072) dropdown_changes.dropdownIndex = /*dropdownActiveIndex*/ ctx[17];
    			if (dirty[0] & /*availableItems*/ 16777216) dropdown_changes.items = /*availableItems*/ ctx[24];
    			if (dirty[0] & /*listIndex*/ 33554432) dropdown_changes.listIndex = /*listIndex*/ ctx[25];
    			if (dirty[0] & /*listMessage*/ 2097152) dropdown_changes.listMessage = /*listMessage*/ ctx[21];
    			dropdown.$set(dropdown_changes);

    			if (/*name*/ ctx[3] && !/*anchor*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block$3(ctx);
    					if_block.c();
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (!current || dirty[0] & /*className*/ 8192 && div_class_value !== (div_class_value = "" + (null_to_empty(`svelecte ${/*className*/ ctx[13]}`) + " svelte-1h9htsj"))) {
    				attr_dev(div, "class", div_class_value);
    			}

    			if (!current || dirty[0] & /*style*/ 16384) {
    				attr_dev(div, "style", /*style*/ ctx[14]);
    			}

    			if (dirty[0] & /*className, disabled*/ 8196) {
    				toggle_class(div, "is-disabled", /*disabled*/ ctx[2]);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(control.$$.fragment, local);
    			transition_in(dropdown.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(control.$$.fragment, local);
    			transition_out(dropdown.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(t1);
    			if (detaching) detach_dev(div);
    			/*control_binding*/ ctx[56](null);
    			destroy_component(control);
    			/*dropdown_binding*/ ctx[57](null);
    			destroy_component(dropdown);
    			if (if_block) if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    const formatterList = {
    	default(item) {
    		return item[this.label];
    	}
    };

    function addFormatter(name, formatFn) {
    	if (name instanceof Object) {
    		formatterList = Object.assign(formatterList, name);
    	} else {
    		formatterList[name] = formatFn;
    	}
    }


    const config = settings;

    function instance$5($$self, $$props, $$invalidate) {
    	let $hasFocus;
    	let $inputValue;
    	let $hasDropdownOpened;
    	let { $$slots: slots = {}, $$scope } = $$props;
    	validate_slots("Svelecte", slots, ['icon']);
    	let { name = null } = $$props;
    	let { anchor = null } = $$props;
    	let { required = false } = $$props;
    	let { multiple = settings.multiple } = $$props;
    	let { collapseSelection = settings.collapseSelection } = $$props;
    	let { disabled = settings.disabled } = $$props;
    	let { creatable = settings.creatable } = $$props;
    	let { creatablePrefix = settings.creatablePrefix } = $$props;
    	let { selectOnTab = settings.selectOnTab } = $$props;
    	let { valueField = settings.valueField } = $$props;
    	let { labelField = settings.labelField } = $$props;
    	let { max = settings.max } = $$props;
    	let { renderer = null } = $$props;
    	let { clearable = settings.clearable } = $$props;
    	let { searchable = settings.searchable } = $$props;
    	let { delimiter = settings.delimiter } = $$props;
    	let { placeholder = "Select" } = $$props;
    	let { fetch = null } = $$props;
    	let { fetchMode = "auto" } = $$props;
    	let { fetchCallback = null } = $$props;
    	let { options = [] } = $$props;
    	let { virtualList = settings.virtualList } = $$props;
    	let { vlHeight = settings.vlHeight } = $$props;
    	let { vlItemSize = settings.vlItemSize } = $$props;
    	let { searchField = null } = $$props;
    	let { sortField = null } = $$props;
    	let { sortRemote = settings.sortRemoteResults } = $$props;
    	let { searchMode = "auto" } = $$props; // FUTURE: this about implementing this
    	let { class: className = "svelecte-control" } = $$props;
    	let { style = null } = $$props;
    	let { selection = undefined } = $$props;
    	let { value = undefined } = $$props;

    	const getSelection = onlyValues => {
    		if (!selection) return multiple ? [] : null;

    		return multiple
    		? selection.map(opt => onlyValues
    			? opt[currentValueField]
    			: Object.assign({}, opt))
    		: onlyValues
    			? selection[currentValueField]
    			: Object.assign({}, selection);
    	};

    	const setSelection = selection => _selectByValues(selection);

    	const clearByParent = doDisable => {
    		clearSelection();
    		emitChangeEvent();
    		if (doDisable) $$invalidate(2, disabled = true);
    		$$invalidate(35, fetch = null);
    	};

    	const dispatch = createEventDispatcher();
    	let isInitialized = false;
    	let refDropdown;
    	let refControl;
    	let ignoreHover = false;
    	let dropdownActiveIndex = null;

    	// !multiple && options.some(o => o.isSelected)
    	//   ? options.indexOf(options.filter(o => o.isSelected).shift())
    	//   : 0;
    	let fetchUnsubscribe = null;

    	let currentValueField = valueField;
    	let currentLabelField = labelField;

    	/** ************************************ automatic init */
    	multiple = name && !multiple ? name.endsWith("[]") : multiple;

    	if (searchMode === "auto") {
    		currentValueField = valueField || fieldInit("value", options);
    		currentLabelField = labelField || fieldInit("label", options);
    	}

    	/** ************************************ Context definition */
    	const inputValue = writable("");

    	validate_store(inputValue, "inputValue");
    	component_subscribe($$self, inputValue, value => $$invalidate(66, $inputValue = value));
    	const hasFocus = writable(false);
    	validate_store(hasFocus, "hasFocus");
    	component_subscribe($$self, hasFocus, value => $$invalidate(64, $hasFocus = value));
    	const hasDropdownOpened = writable(false);
    	validate_store(hasDropdownOpened, "hasDropdownOpened");
    	component_subscribe($$self, hasDropdownOpened, value => $$invalidate(69, $hasDropdownOpened = value));
    	let isFetchingData = false;

    	const { settings: settings$1, selectOption, deselectOption, clearSelection, settingsUnsubscribe, listLength, matchingOptions, updateOpts } = initStore(
    		options,
    		selection,
    		{
    			currentValueField,
    			currentLabelField,
    			max,
    			multiple,
    			creatable,
    			searchField,
    			sortField,
    			sortRemote
    		},
    		config.i18n
    	);

    	setContext(key, {
    		hasFocus,
    		hasDropdownOpened,
    		inputValue,
    		selectOption,
    		deselectOption,
    		clearSelection,
    		listLength,
    		matchingOptions,
    		isFetchingData
    	});

    	function createFetch(fetch) {
    		if (fetchUnsubscribe) {
    			fetchUnsubscribe();
    			fetchUnsubscribe = null;
    		}

    		if (!fetch) return null;
    		const fetchSource = typeof fetch === "string" ? fetchRemote(fetch) : fetch;
    		const initFetchOnly = fetchMode === "init" || fetchMode === "auto" && typeof fetch === "string" && fetch.indexOf("[query]") === -1;

    		const debouncedFetch = debounce(
    			query => {
    				fetchSource(query, fetchCallback || settings.fetchCallback).then(data => {
    					$$invalidate(36, options = data);
    				}).catch(() => $$invalidate(36, options = [])).finally(() => {
    					$$invalidate(20, isFetchingData = false);
    					$hasFocus && hasDropdownOpened.set(true);
    					$$invalidate(21, listMessage = config.i18n.fetchEmpty);
    					tick().then(() => dispatch("fetch", options));
    				});
    			},
    			500
    		);

    		if (initFetchOnly) {
    			if (typeof fetch === "string" && fetch.indexOf("[parent]") !== -1) return null;
    			$$invalidate(20, isFetchingData = true);
    			debouncedFetch(null);
    			return null;
    		}

    		fetchUnsubscribe = inputValue.subscribe(value => {
    			if (xhr && xhr.readyState !== 4) {
    				// cancel previously run 
    				xhr.abort();
    			}

    			

    			if (!value) {
    				$$invalidate(21, listMessage = config.i18n.fetchBefore);
    				return;
    			}

    			$$invalidate(20, isFetchingData = true);
    			hasDropdownOpened.set(false);
    			debouncedFetch(value);
    		});

    		return debouncedFetch;
    	}

    	/** ************************************ component logic */
    	value && _selectByValues(value); // init values if passed

    	let prevSelection = selection;
    	let prevOptions = options;

    	/**
     * Dispatch change event on add options/remove selected items
     */
    	function emitChangeEvent() {
    		tick().then(() => {
    			dispatch("change", selection);
    		});
    	}

    	/**
     * Internal helper for passed value array. Should be used for CE
     */
    	function _selectByValues(values) {
    		if (!Array.isArray(values)) values = [values];
    		if (values && values.length && values[0] instanceof Object) values = values.map(opt => opt[currentValueField]);
    		clearSelection();
    		const newAddition = [];

    		values.forEach(val => {
    			availableItems.some(opt => {
    				if (val == opt[currentValueField]) {
    					newAddition.push(opt);
    					return true;
    				}

    				return false;
    			});
    		});

    		newAddition.forEach(selectOption);
    	}

    	/**
     * Add given option to selection pool
     */
    	function onSelect(event, opt) {
    		opt = opt || event.detail;
    		if (disabled || opt.isDisabled) return;

    		if (!multiple && selectedOptions.length) {
    			$$invalidate(22, selectedOptions[0].isSelected = false, selectedOptions);
    		}

    		if (typeof opt === "string") {
    			opt = {
    				[currentLabelField]: `${creatablePrefix}${opt}`,
    				[currentValueField]: encodeURIComponent(opt),
    				isSelected: true,
    				_created: true
    			};

    			$$invalidate(36, options = [...options, opt]);
    		}

    		opt.isSelected = true;
    		($$invalidate(65, flatItems), $$invalidate(36, options));
    		set_store_value(inputValue, $inputValue = "");

    		if (!multiple) {
    			set_store_value(hasDropdownOpened, $hasDropdownOpened = false);
    		} else {
    			tick().then(() => {
    				$$invalidate(17, dropdownActiveIndex = maxReached
    				? null
    				: listIndex.next(dropdownActiveIndex - 1));
    			});
    		}

    		emitChangeEvent();
    	}

    	/**
     * Remove option/all options from selection pool
     */
    	function onDeselect(event, opt) {
    		if (disabled) return;
    		opt = opt || event.detail;

    		if (opt) {
    			opt.isSelected = false;
    			($$invalidate(65, flatItems), $$invalidate(36, options));
    		} else {
    			// apply for 'x' when clearable:true || ctrl+backspace || ctrl+delete
    			$$invalidate(65, flatItems = flatItems.map(opt => {
    				if (opt.isSelected) opt.isSelected = false;
    				return opt;
    			}));
    		}

    		tick().then(refControl.focusControl);
    		emitChangeEvent();

    		tick().then(() => {
    			$$invalidate(17, dropdownActiveIndex = listIndex.next(-1));
    		});
    	}

    	/**
     * Dropdown hover handler - update active item
     */
    	function onHover(event) {
    		if (ignoreHover) {
    			ignoreHover = false;
    			return;
    		}

    		$$invalidate(17, dropdownActiveIndex = event.detail);
    	}

    	/**
     * Keyboard navigation
     */
    	function onKeyDown(event) {
    		event = event.detail; // from dispatched event

    		if (creatable && delimiter.indexOf(event.key) > -1) {
    			$inputValue.length > 0 && onSelect(null, $inputValue); // prevent creating item with delimiter itself
    			event.preventDefault();
    			return;
    		}

    		const Tab = selectOnTab && $hasDropdownOpened && !event.shiftKey
    		? "Tab"
    		: "No-tab";

    		switch (event.key) {
    			case "PageDown":
    			case "End":
    				$$invalidate(17, dropdownActiveIndex = listIndex.first);
    			case "ArrowUp":
    				if (!$hasDropdownOpened) {
    					set_store_value(hasDropdownOpened, $hasDropdownOpened = true);
    					return;
    				}
    				event.preventDefault();
    				$$invalidate(17, dropdownActiveIndex = listIndex.prev(dropdownActiveIndex));
    				tick().then(refDropdown.scrollIntoView);
    				ignoreHover = true;
    				break;
    			case "PageUp":
    			case "Home":
    				$$invalidate(17, dropdownActiveIndex = listIndex.last);
    			case "ArrowDown":
    				if (!$hasDropdownOpened) {
    					set_store_value(hasDropdownOpened, $hasDropdownOpened = true);
    					return;
    				}
    				event.preventDefault();
    				$$invalidate(17, dropdownActiveIndex = listIndex.next(dropdownActiveIndex));
    				tick().then(refDropdown.scrollIntoView);
    				ignoreHover = true;
    				break;
    			case "Escape":
    				if ($hasDropdownOpened) {
    					// prevent ESC bubble in this case (interfering with modal closing etc. (bootstrap))
    					event.preventDefault();

    					event.stopPropagation();
    				}
    				if (!$inputValue) {
    					set_store_value(hasDropdownOpened, $hasDropdownOpened = false);
    				}
    				set_store_value(inputValue, $inputValue = "");
    				break;
    			case Tab:
    				set_store_value(hasDropdownOpened, $hasDropdownOpened = false);
    				event.preventDefault();
    			case "Enter":
    				if (!$hasDropdownOpened) return;
    				let activeDropdownItem = availableItems[dropdownActiveIndex];
    				if (creatable && $inputValue) {
    					activeDropdownItem = !activeDropdownItem || event.ctrlKey
    					? $inputValue
    					: activeDropdownItem;
    				}
    				activeDropdownItem && onSelect(null, activeDropdownItem);
    				if (availableItems.length <= dropdownActiveIndex) {
    					$$invalidate(17, dropdownActiveIndex = currentListLength > 0
    					? currentListLength
    					: listIndex.first);
    				}
    				event.preventDefault();
    				break;
    			case " ":
    				if (!$hasDropdownOpened) {
    					set_store_value(hasDropdownOpened, $hasDropdownOpened = true); // prevent form submit
    					event.preventDefault();
    				}
    				break;
    			case "Backspace":
    			case "Delete":
    				if ($inputValue === "" && selectedOptions.length) {
    					event.ctrlKey
    					? onDeselect({})
    					: onDeselect(null, selectedOptions.pop());
    				}
    			default:
    				if (!event.ctrlKey && !["Tab", "Shift"].includes(event.key) && !$hasDropdownOpened && !isFetchingData) {
    					set_store_value(hasDropdownOpened, $hasDropdownOpened = true);
    				}
    				if (!multiple && selectedOptions.length && event.key !== "Tab") event.preventDefault();
    		}
    	}

    	/**
     * Enable create items by pasting
     */
    	function onPaste(event) {
    		if (creatable) {
    			event.preventDefault();
    			const rx = new RegExp("([^" + delimiter + "\\n]+)", "g");
    			const pasted = event.clipboardData.getData("text/plain");
    			pasted.match(rx).forEach(opt => onSelect(null, opt.trim()));
    		}
    	} // do nothing otherwise

    	/** ************************************ component lifecycle related */
    	onMount(() => {
    		$$invalidate(59, isInitialized = true);

    		// Lazy calling of scrollIntoView function, which is required
    		// TODO: resolve, probably already fixed
    		// if (val <= dropdownActiveIndex) dropdownActiveIndex = val;
    		// if (dropdownActiveIndex < 0) dropdownActiveIndex = listIndexMap.first;
    		if (prevSelection && !multiple) {
    			$$invalidate(17, dropdownActiveIndex = flatItems.findIndex(opt => opt[currentValueField] === prevSelection[currentValueField]));
    			tick().then(() => refDropdown && refDropdown.scrollIntoView({}));
    		}

    		if (anchor) anchor.classList.add("anchored-select");
    	});

    	const writable_props = [
    		"name",
    		"anchor",
    		"required",
    		"multiple",
    		"collapseSelection",
    		"disabled",
    		"creatable",
    		"creatablePrefix",
    		"selectOnTab",
    		"valueField",
    		"labelField",
    		"max",
    		"renderer",
    		"clearable",
    		"searchable",
    		"delimiter",
    		"placeholder",
    		"fetch",
    		"fetchMode",
    		"fetchCallback",
    		"options",
    		"virtualList",
    		"vlHeight",
    		"vlItemSize",
    		"searchField",
    		"sortField",
    		"sortRemote",
    		"searchMode",
    		"class",
    		"style",
    		"selection",
    		"value"
    	];

    	Object_1$1.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Svelecte> was created with unknown prop '${key}'`);
    	});

    	function control_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			refControl = $$value;
    			$$invalidate(16, refControl);
    		});
    	}

    	function dropdown_binding($$value) {
    		binding_callbacks[$$value ? "unshift" : "push"](() => {
    			refDropdown = $$value;
    			$$invalidate(15, refDropdown);
    		});
    	}

    	$$self.$$set = $$props => {
    		if ("name" in $$props) $$invalidate(3, name = $$props.name);
    		if ("anchor" in $$props) $$invalidate(0, anchor = $$props.anchor);
    		if ("required" in $$props) $$invalidate(4, required = $$props.required);
    		if ("multiple" in $$props) $$invalidate(1, multiple = $$props.multiple);
    		if ("collapseSelection" in $$props) $$invalidate(5, collapseSelection = $$props.collapseSelection);
    		if ("disabled" in $$props) $$invalidate(2, disabled = $$props.disabled);
    		if ("creatable" in $$props) $$invalidate(6, creatable = $$props.creatable);
    		if ("creatablePrefix" in $$props) $$invalidate(39, creatablePrefix = $$props.creatablePrefix);
    		if ("selectOnTab" in $$props) $$invalidate(40, selectOnTab = $$props.selectOnTab);
    		if ("valueField" in $$props) $$invalidate(41, valueField = $$props.valueField);
    		if ("labelField" in $$props) $$invalidate(42, labelField = $$props.labelField);
    		if ("max" in $$props) $$invalidate(43, max = $$props.max);
    		if ("renderer" in $$props) $$invalidate(44, renderer = $$props.renderer);
    		if ("clearable" in $$props) $$invalidate(7, clearable = $$props.clearable);
    		if ("searchable" in $$props) $$invalidate(8, searchable = $$props.searchable);
    		if ("delimiter" in $$props) $$invalidate(45, delimiter = $$props.delimiter);
    		if ("placeholder" in $$props) $$invalidate(9, placeholder = $$props.placeholder);
    		if ("fetch" in $$props) $$invalidate(35, fetch = $$props.fetch);
    		if ("fetchMode" in $$props) $$invalidate(46, fetchMode = $$props.fetchMode);
    		if ("fetchCallback" in $$props) $$invalidate(47, fetchCallback = $$props.fetchCallback);
    		if ("options" in $$props) $$invalidate(36, options = $$props.options);
    		if ("virtualList" in $$props) $$invalidate(10, virtualList = $$props.virtualList);
    		if ("vlHeight" in $$props) $$invalidate(11, vlHeight = $$props.vlHeight);
    		if ("vlItemSize" in $$props) $$invalidate(12, vlItemSize = $$props.vlItemSize);
    		if ("searchField" in $$props) $$invalidate(48, searchField = $$props.searchField);
    		if ("sortField" in $$props) $$invalidate(49, sortField = $$props.sortField);
    		if ("sortRemote" in $$props) $$invalidate(50, sortRemote = $$props.sortRemote);
    		if ("searchMode" in $$props) $$invalidate(51, searchMode = $$props.searchMode);
    		if ("class" in $$props) $$invalidate(13, className = $$props.class);
    		if ("style" in $$props) $$invalidate(14, style = $$props.style);
    		if ("selection" in $$props) $$invalidate(37, selection = $$props.selection);
    		if ("value" in $$props) $$invalidate(38, value = $$props.value);
    		if ("$$scope" in $$props) $$invalidate(58, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({
    		defaults: settings,
    		debounce,
    		xhr,
    		fieldInit,
    		formatterList,
    		addFormatter,
    		config,
    		setContext,
    		createEventDispatcher,
    		tick,
    		onMount,
    		writable,
    		key,
    		initStore,
    		fetchRemote,
    		flatList,
    		filterList,
    		indexList,
    		Control,
    		Dropdown,
    		name,
    		anchor,
    		required,
    		multiple,
    		collapseSelection,
    		disabled,
    		creatable,
    		creatablePrefix,
    		selectOnTab,
    		valueField,
    		labelField,
    		max,
    		renderer,
    		clearable,
    		searchable,
    		delimiter,
    		placeholder,
    		fetch,
    		fetchMode,
    		fetchCallback,
    		options,
    		virtualList,
    		vlHeight,
    		vlItemSize,
    		searchField,
    		sortField,
    		sortRemote,
    		searchMode,
    		className,
    		style,
    		selection,
    		value,
    		getSelection,
    		setSelection,
    		clearByParent,
    		dispatch,
    		isInitialized,
    		refDropdown,
    		refControl,
    		ignoreHover,
    		dropdownActiveIndex,
    		fetchUnsubscribe,
    		currentValueField,
    		currentLabelField,
    		inputValue,
    		hasFocus,
    		hasDropdownOpened,
    		isFetchingData,
    		settings: settings$1,
    		selectOption,
    		deselectOption,
    		clearSelection,
    		settingsUnsubscribe,
    		listLength,
    		matchingOptions,
    		updateOpts,
    		createFetch,
    		prevSelection,
    		prevOptions,
    		emitChangeEvent,
    		_selectByValues,
    		onSelect,
    		onDeselect,
    		onHover,
    		onKeyDown,
    		onPaste,
    		initFetchOnly,
    		$hasFocus,
    		listMessage,
    		flatItems,
    		selectedOptions,
    		maxReached,
    		availableItems,
    		$inputValue,
    		listIndex,
    		currentListLength,
    		itemRenderer,
    		dropdownComponent,
    		$hasDropdownOpened
    	});

    	$$self.$inject_state = $$props => {
    		if ("name" in $$props) $$invalidate(3, name = $$props.name);
    		if ("anchor" in $$props) $$invalidate(0, anchor = $$props.anchor);
    		if ("required" in $$props) $$invalidate(4, required = $$props.required);
    		if ("multiple" in $$props) $$invalidate(1, multiple = $$props.multiple);
    		if ("collapseSelection" in $$props) $$invalidate(5, collapseSelection = $$props.collapseSelection);
    		if ("disabled" in $$props) $$invalidate(2, disabled = $$props.disabled);
    		if ("creatable" in $$props) $$invalidate(6, creatable = $$props.creatable);
    		if ("creatablePrefix" in $$props) $$invalidate(39, creatablePrefix = $$props.creatablePrefix);
    		if ("selectOnTab" in $$props) $$invalidate(40, selectOnTab = $$props.selectOnTab);
    		if ("valueField" in $$props) $$invalidate(41, valueField = $$props.valueField);
    		if ("labelField" in $$props) $$invalidate(42, labelField = $$props.labelField);
    		if ("max" in $$props) $$invalidate(43, max = $$props.max);
    		if ("renderer" in $$props) $$invalidate(44, renderer = $$props.renderer);
    		if ("clearable" in $$props) $$invalidate(7, clearable = $$props.clearable);
    		if ("searchable" in $$props) $$invalidate(8, searchable = $$props.searchable);
    		if ("delimiter" in $$props) $$invalidate(45, delimiter = $$props.delimiter);
    		if ("placeholder" in $$props) $$invalidate(9, placeholder = $$props.placeholder);
    		if ("fetch" in $$props) $$invalidate(35, fetch = $$props.fetch);
    		if ("fetchMode" in $$props) $$invalidate(46, fetchMode = $$props.fetchMode);
    		if ("fetchCallback" in $$props) $$invalidate(47, fetchCallback = $$props.fetchCallback);
    		if ("options" in $$props) $$invalidate(36, options = $$props.options);
    		if ("virtualList" in $$props) $$invalidate(10, virtualList = $$props.virtualList);
    		if ("vlHeight" in $$props) $$invalidate(11, vlHeight = $$props.vlHeight);
    		if ("vlItemSize" in $$props) $$invalidate(12, vlItemSize = $$props.vlItemSize);
    		if ("searchField" in $$props) $$invalidate(48, searchField = $$props.searchField);
    		if ("sortField" in $$props) $$invalidate(49, sortField = $$props.sortField);
    		if ("sortRemote" in $$props) $$invalidate(50, sortRemote = $$props.sortRemote);
    		if ("searchMode" in $$props) $$invalidate(51, searchMode = $$props.searchMode);
    		if ("className" in $$props) $$invalidate(13, className = $$props.className);
    		if ("style" in $$props) $$invalidate(14, style = $$props.style);
    		if ("selection" in $$props) $$invalidate(37, selection = $$props.selection);
    		if ("value" in $$props) $$invalidate(38, value = $$props.value);
    		if ("isInitialized" in $$props) $$invalidate(59, isInitialized = $$props.isInitialized);
    		if ("refDropdown" in $$props) $$invalidate(15, refDropdown = $$props.refDropdown);
    		if ("refControl" in $$props) $$invalidate(16, refControl = $$props.refControl);
    		if ("ignoreHover" in $$props) ignoreHover = $$props.ignoreHover;
    		if ("dropdownActiveIndex" in $$props) $$invalidate(17, dropdownActiveIndex = $$props.dropdownActiveIndex);
    		if ("fetchUnsubscribe" in $$props) fetchUnsubscribe = $$props.fetchUnsubscribe;
    		if ("currentValueField" in $$props) $$invalidate(18, currentValueField = $$props.currentValueField);
    		if ("currentLabelField" in $$props) $$invalidate(19, currentLabelField = $$props.currentLabelField);
    		if ("isFetchingData" in $$props) $$invalidate(20, isFetchingData = $$props.isFetchingData);
    		if ("prevSelection" in $$props) $$invalidate(62, prevSelection = $$props.prevSelection);
    		if ("prevOptions" in $$props) $$invalidate(80, prevOptions = $$props.prevOptions);
    		if ("initFetchOnly" in $$props) initFetchOnly = $$props.initFetchOnly;
    		if ("listMessage" in $$props) $$invalidate(21, listMessage = $$props.listMessage);
    		if ("flatItems" in $$props) $$invalidate(65, flatItems = $$props.flatItems);
    		if ("selectedOptions" in $$props) $$invalidate(22, selectedOptions = $$props.selectedOptions);
    		if ("maxReached" in $$props) $$invalidate(23, maxReached = $$props.maxReached);
    		if ("availableItems" in $$props) $$invalidate(24, availableItems = $$props.availableItems);
    		if ("listIndex" in $$props) $$invalidate(25, listIndex = $$props.listIndex);
    		if ("currentListLength" in $$props) currentListLength = $$props.currentListLength;
    		if ("itemRenderer" in $$props) $$invalidate(26, itemRenderer = $$props.itemRenderer);
    		if ("dropdownComponent" in $$props) dropdownComponent = $$props.dropdownComponent;
    	};

    	let initFetchOnly;
    	let flatItems;
    	let selectedOptions;
    	let maxReached;
    	let availableItems;
    	let listIndex;
    	let currentListLength;
    	let listMessage;
    	let itemRenderer;
    	let dropdownComponent;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty[1] & /*fetchMode, fetch*/ 32784) {
    			/** ************************************ remote source */
    			 initFetchOnly = fetchMode === "init" || typeof fetch === "string" && fetch.indexOf("[query]") === -1;
    		}

    		if ($$self.$$.dirty[1] & /*fetch*/ 16) {
    			 createFetch(fetch);
    		}

    		if ($$self.$$.dirty[1] & /*options*/ 32) {
    			/** - - - - - - - - - - STORE - - - - - - - - - - - - - -*/
    			 $$invalidate(65, flatItems = flatList(options));
    		}

    		if ($$self.$$.dirty[2] & /*flatItems*/ 8) {
    			 $$invalidate(22, selectedOptions = flatItems.filter(opt => opt.isSelected));
    		}

    		if ($$self.$$.dirty[0] & /*currentValueField, currentLabelField*/ 786432 | $$self.$$.dirty[1] & /*isInitialized, options, searchMode, valueField, labelField*/ 269487136) {
    			 {
    				if (isInitialized && prevOptions !== options) {
    					if (searchMode === "auto") {
    						const ivalue = fieldInit("value", options || null);
    						const ilabel = fieldInit("label", options || null);
    						if (!valueField && currentValueField !== ivalue) $$invalidate(18, currentValueField = ivalue);
    						if (!labelField && currentLabelField !== ilabel) $$invalidate(19, currentLabelField = ilabel);
    					}

    					// NOTE: this event should not be emitted
    					// if (options.some(opt => opt.isSelected)) emitChangeEvent();
    					updateOpts(options);
    				}
    			}
    		}

    		if ($$self.$$.dirty[0] & /*multiple, selectedOptions, currentValueField, anchor*/ 4456451 | $$self.$$.dirty[1] & /*value*/ 128) {
    			 {
    				const _unifiedSelection = multiple
    				? selectedOptions
    				: selectedOptions.length ? selectedOptions[0] : null;

    				$$invalidate(38, value = multiple
    				? selectedOptions.map(opt => opt[currentValueField])
    				: selectedOptions.length
    					? selectedOptions[0][currentValueField]
    					: null);

    				$$invalidate(62, prevSelection = _unifiedSelection);
    				$$invalidate(37, selection = _unifiedSelection);

    				// Custom-element related
    				if (anchor) {
    					$$invalidate(
    						0,
    						anchor.innerHTML = (Array.isArray(value) ? value : [value]).reduce(
    							(res, item) => {
    								if (!item) {
    									res = "<option value=\"\" selected=\"\"></option>";
    									return res;
    								}

    								
    								res += `<option value="${item}" selected>${item}</option>`;
    								return res;
    							},
    							""
    						),
    						anchor
    					);

    					anchor.dispatchEvent(new Event("change"));
    				}
    			}
    		}

    		if ($$self.$$.dirty[1] & /*selection*/ 64 | $$self.$$.dirty[2] & /*prevSelection*/ 1) {
    			 {
    				if (prevSelection !== selection) {
    					clearSelection();

    					if (selection) {
    						Array.isArray(selection)
    						? selection.forEach(selectOption)
    						: selectOption(selection);
    					}

    					$$invalidate(62, prevSelection = selection);
    				}
    			}
    		}

    		if ($$self.$$.dirty[0] & /*selectedOptions*/ 4194304 | $$self.$$.dirty[1] & /*max*/ 4096) {
    			 $$invalidate(23, maxReached = max && selectedOptions.length === max);
    		}

    		if ($$self.$$.dirty[0] & /*maxReached, multiple, selectedOptions*/ 12582914 | $$self.$$.dirty[2] & /*flatItems, $inputValue*/ 24) {
    			 $$invalidate(24, availableItems = maxReached
    			? []
    			: filterList(flatItems, $inputValue, multiple, selectedOptions.length));
    		}

    		if ($$self.$$.dirty[0] & /*availableItems*/ 16777216) {
    			 $$invalidate(25, listIndex = indexList(availableItems));
    		}

    		if ($$self.$$.dirty[0] & /*creatable, availableItems*/ 16777280 | $$self.$$.dirty[2] & /*$inputValue*/ 16) {
    			 currentListLength = creatable && $inputValue
    			? availableItems.length
    			: availableItems.length - 1;
    		}

    		if ($$self.$$.dirty[0] & /*maxReached*/ 8388608 | $$self.$$.dirty[1] & /*max*/ 4096) {
    			// $: {
    			//   if (dropdownActiveIndex === null) {
    			//     dropdownActiveIndex = listIndex.first;
    			//   } else if (dropdownActiveIndex > listIndex.last) {
    			//     dropdownActiveIndex = listIndex.last;
    			//   }
    			// }
    			 $$invalidate(21, listMessage = maxReached ? config.i18n.max(max) : config.i18n.empty);
    		}

    		if ($$self.$$.dirty[0] & /*currentLabelField*/ 524288 | $$self.$$.dirty[1] & /*renderer*/ 8192) {
    			 $$invalidate(26, itemRenderer = typeof renderer === "function"
    			? renderer
    			: formatterList[renderer] || formatterList.default.bind({ label: currentLabelField }));
    		}
    	};

    	 dropdownComponent = Dropdown;

    	return [
    		anchor,
    		multiple,
    		disabled,
    		name,
    		required,
    		collapseSelection,
    		creatable,
    		clearable,
    		searchable,
    		placeholder,
    		virtualList,
    		vlHeight,
    		vlItemSize,
    		className,
    		style,
    		refDropdown,
    		refControl,
    		dropdownActiveIndex,
    		currentValueField,
    		currentLabelField,
    		isFetchingData,
    		listMessage,
    		selectedOptions,
    		maxReached,
    		availableItems,
    		listIndex,
    		itemRenderer,
    		inputValue,
    		hasFocus,
    		hasDropdownOpened,
    		onSelect,
    		onDeselect,
    		onHover,
    		onKeyDown,
    		onPaste,
    		fetch,
    		options,
    		selection,
    		value,
    		creatablePrefix,
    		selectOnTab,
    		valueField,
    		labelField,
    		max,
    		renderer,
    		delimiter,
    		fetchMode,
    		fetchCallback,
    		searchField,
    		sortField,
    		sortRemote,
    		searchMode,
    		getSelection,
    		setSelection,
    		clearByParent,
    		slots,
    		control_binding,
    		dropdown_binding,
    		$$scope
    	];
    }

    class Svelecte extends SvelteComponentDev {
    	constructor(options) {
    		super(options);

    		init(
    			this,
    			options,
    			instance$5,
    			create_fragment$5,
    			safe_not_equal,
    			{
    				name: 3,
    				anchor: 0,
    				required: 4,
    				multiple: 1,
    				collapseSelection: 5,
    				disabled: 2,
    				creatable: 6,
    				creatablePrefix: 39,
    				selectOnTab: 40,
    				valueField: 41,
    				labelField: 42,
    				max: 43,
    				renderer: 44,
    				clearable: 7,
    				searchable: 8,
    				delimiter: 45,
    				placeholder: 9,
    				fetch: 35,
    				fetchMode: 46,
    				fetchCallback: 47,
    				options: 36,
    				virtualList: 10,
    				vlHeight: 11,
    				vlItemSize: 12,
    				searchField: 48,
    				sortField: 49,
    				sortRemote: 50,
    				searchMode: 51,
    				class: 13,
    				style: 14,
    				selection: 37,
    				value: 38,
    				getSelection: 52,
    				setSelection: 53,
    				clearByParent: 54
    			},
    			[-1, -1, -1]
    		);

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Svelecte",
    			options,
    			id: create_fragment$5.name
    		});
    	}

    	get name() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set name(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get anchor() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set anchor(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get required() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set required(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get multiple() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set multiple(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get collapseSelection() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set collapseSelection(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get disabled() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set disabled(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get creatable() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set creatable(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get creatablePrefix() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set creatablePrefix(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selectOnTab() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selectOnTab(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get valueField() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set valueField(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get labelField() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set labelField(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get max() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set max(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get renderer() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set renderer(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get clearable() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set clearable(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get searchable() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set searchable(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get delimiter() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set delimiter(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get placeholder() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set placeholder(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get fetch() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set fetch(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get fetchMode() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set fetchMode(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get fetchCallback() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set fetchCallback(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get options() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set options(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get virtualList() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set virtualList(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get vlHeight() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set vlHeight(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get vlItemSize() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set vlItemSize(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get searchField() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set searchField(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get sortField() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set sortField(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get sortRemote() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set sortRemote(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get searchMode() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set searchMode(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get class() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set class(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get style() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set style(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get selection() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set selection(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get value() {
    		throw new Error("<Svelecte>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set value(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get getSelection() {
    		return this.$$.ctx[52];
    	}

    	set getSelection(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get setSelection() {
    		return this.$$.ctx[53];
    	}

    	set setSelection(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get clearByParent() {
    		return this.$$.ctx[54];
    	}

    	set clearByParent(value) {
    		throw new Error("<Svelecte>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    const OPTION_LIST = [
      'options', 'fetch', 'name', 'required', 'value',
      'multiple','disabled', 'max', 'creatable', 'delimiter',
      'placeholder', 'renderer', 'searchable', 'clearable', 'fetch', 'valueField', 'labelField',
      'anchor'
    ];

    function formatValue(name, value) {
      switch (name) {
        case 'options':
          if (Array.isArray(value)) return value;
          try {
            value = JSON.parse(value);
            if (!Array.isArray(value)) {
              value = [];
            }
          } catch (e) {
            value = [];
          }
          return value;
        case 'value':
          return value ? value.split(',').map(item => {
            const _v = parseInt(item);
            return isNaN(_v) ? item : _v;
          }) : '';
        case 'renderer':
          return value || 'default';
        case 'searchable':
          return value == 'true';
        case 'clearable':
          return value != 'false';
        case 'required':
        case 'multiple':
        case 'creatable':
        case 'selectOnTab':
          return value !== null;
        case 'disabled':
          return value !== null;
        case 'max':
          return isNaN(parseInt(value)) ? 0 : parseInt(value);
        case 'anchor':
          return value ? document.getElementById(value) : null;
      }
      return value;
    }

    /**
     * Connect Custom Component attributes to Svelte Component properties
     * @param {string} name Name of the Custom Component
     */
    const SvelecteElement = class extends HTMLElement {
      constructor() {
        super();
        this.svelecte = undefined;
        this._fetchOpts = null;
        
        /** ************************************ public API */
        this.setOptions = options => this.svelecte.setOptions(options);
        Object.defineProperties(this, {
          'selection': {
            get() {
              return this.svelecte.getSelection();
            }
          },
          'value': {
            get() {
              return this.svelecte.getSelection(true);
            },
            set(value) {
              this.setAttribute('value', Array.isArray(value) ? value.join(',') : value);
            }
          },
          'options': {
            get() {
              return this.hasAttribute('options')
                ? JSON.parse(this.getAttribute('options'))
                : (this._fetchOpts || []);
            },
            set(value) {
              this.setAttribute('options', Array.isArray(value) ? JSON.stringify(value) : value);
            }
          },
          'disabled': {
            get() {
              return this.getAttribute('disabled') !== null;
            },
            set(value) {
              if (!value) { 
                this.removeAttribute('disabled');
              } else {
                this.setAttribute('disabled', value === true ? '' : value);
              }
            }
          },
          'multiple': {
            get() {
              return this.getAttribute('multiple') !== null;
            },
            set(value) {
              if (!value) { 
                this.removeAttribute('multiple');
              } else {
                this.setAttribute('multiple', value === true ? '' : value);
              }
            }
          },
          'creatable': {
            get() {
              return this.getAttribute('creatable') !== null;
            },
            set(value) {
              if (!value) { 
                this.removeAttribute('creatable');
              } else {
                this.setAttribute('creatable', value === true ? '' : value);
              }
            }
          },
          'clearable': {
            get() {
              return this.getAttribute('clearable') !== 'false';
            },
            set(value) {
              this.setAttribute('clearable', value ? 'true' : 'false');
            }
          },
          'placeholder': {
            get() {
              return this.getAttribute('placeholder') || '';
            },
            set(value) {
              this.setAttribute('placeholder', value || 'Select');
            }
          },
          'renderer': {
            get() {
              return this.getAttribute('renderer') || 'default';
            },
            set(value) {
              value && this.setAttribute('renderer', value);
            }
          },
          'required': {
            get() {
              return this.hasAttribute('required');
            },
            set(value) {
              if (!value) {
                this.removeAttribute('required');
              } else {
                this.setAttribute('required', '');
              }
            }
          },
          'anchor': {
            get() {
              return this.getAttribute('anchor');
            },
            set(value) {
              this.setAttribute('anchor', value);
            }
          },
          'max': {
            get() {
              return this.getAttribute('max') || 0;
            },
            set(value) {
              try {
                value = parseInt(value);
                if (value < 0) value = 0;
              } catch (e) {
                value = 0;
              }
              this.setAttribute('max', value);
            }
          },
          'delimiter': {
            get() {
              return this.getAttribute('delimiter') || ',';
            },
            set(value) {
              this.setAttribute('delimiter', value);
            }
          },
          'valueField': {
            get() {
              return this.getAttribute('valueField') || '';
            },
            set(value) {
              this.setAttribute('valueField', value);
            }
          },
          'labelField': {
            get() {
              return this.getAttribute('labelField') || '';
            },
            set(value) {
              this.setAttribute('labelField', value);
            }
          }
        });
      }

      focus() {
        !this.disabled && this.querySelector('input').focus();
      }

      static get observedAttributes() {
        return OPTION_LIST;
      }

      attributeChangedCallback(name, oldValue, newValue) {
        if (this.svelecte && oldValue !== newValue) {
          name === 'value'
            ? this.svelecte.setSelection(formatValue(name, newValue))
            : this.svelecte.$set({ [name]: formatValue(name, newValue) });
        }
      }

      connectedCallback() {
        if (this.hasAttribute('parent') || this.hasAttribute('anchor') || this.hasAttribute('lazy')) {
          setTimeout(() => { this.render(); });
        } else {
          this.render();
        }
      }

      render() {
        let props = {};
        for (const attr of OPTION_LIST) {
          if (this.hasAttribute(attr)) {
            props[attr] = formatValue(attr, this.getAttribute(attr));
          }
        }
        if (this.hasAttribute('class')) {
          props.class = this.getAttribute('class');
        }
        if (this.hasAttribute('parent')) {
          delete props['fetch'];
          props.disabled = true;
          this.parent = document.getElementById(this.getAttribute('parent'));
          if (!this.parent.value && this.svelecte) {
            return;
          }      this.parentCallback = e => {
            if (!e.target.selection || (Array.isArray(e.target.selection) && !e.target.selection.length)) {
              this.svelecte.clearByParent(true);
              return;
            }
            !this.parent.disabled && this.removeAttribute('disabled');
            if (this.hasAttribute('fetch')) {
              const fetchUrl = this.getAttribute('fetch').replace('[parent]', e.target.value);
              this.svelecte.$set({ fetch: fetchUrl, disabled: false });
            }
          };
          this.parent.addEventListener('change', this.parentCallback);
        }
        const anchorSelect = this.querySelector('select');
        if (anchorSelect) {
          props['anchor'] = anchorSelect;
          anchorSelect.tabIndex = -1; // just to be sure
        }
        // if (this.childElementCount > 0) {
        //   props.options = Array.prototype.slice.call(this.children).map(opt => {
        //     return Object.assign({
        //       isSelected: opt.selected,
        //       isDisabled: opt.disabled
        //     }, opt.dataset.data ? JSON.parse(opt.dataset.data)
        //       : {
        //         value: opt.value,
        //         text: opt.text,
        //       }
        //     );
        //   });
        //   this.innerHTML = '';
        // }
        this.svelecte = new Svelecte({
          target: this,
          anchor: anchorSelect,
          props,
        });
        this.svelecte.$on('change', e => {
          const value = this.svelecte.getSelection(true);
          this.setAttribute('value', Array.isArray(value) ? value.join(',') : value);
          this.dispatchEvent(e);
        });
        this.svelecte.$on('fetch', e => {
          this._fetchOpts = e.detail;
          this.dispatchEvent(e);
        });
        return true;
      }

      disconnectedCallback() {
        this.svelecte && this.svelecte.$destroy();
        this.parent && this.parent.removeEventListener('change', this.parentCallback);
      }
    };

    exports.SvelecteElement = SvelecteElement;
    exports.addFormatter = addFormatter;
    exports.config = config;

    return exports;

}({}));
