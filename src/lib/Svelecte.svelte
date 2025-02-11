<script context="module">
  import defaults from './settings.js';
  import { debounce, xhr, fieldInit, iOS, android, escapeHtml } from './lib/utils.js'; // shared across instances

  const formatterList = {
    default: function(item) { return escapeHtml(item[this.label]); }
  };
  // provide ability to add additional renderers
  export function addFormatter(name, formatFn) {
    if (name instanceof Object) {
      for (let prop in name) {
        formatterList[prop] = name[prop];
      }
    } else {
      formatterList[name] = formatFn
    }
  };
  export const config = defaults;
  export const TAB_SELECT_NAVIGATE = 'select-navigate';
</script>

<!-- svelte-ignore module-script-reactive-declaration -->
<script>
  import { createEventDispatcher, tick, onMount } from 'svelte';
  import { writable } from 'svelte/store';
  import { fetchRemote, defaultCreateFilter, defaultCreateTransform } from './lib/utils.js';
  import { initSelection, flatList, filterList, indexList, getFilterProps } from './lib/list.js';
  import Control from './components/Control.svelte';
  import Dropdown from './components/Dropdown.svelte';
  import Item from './components/Item.svelte';

  // form and CE
  export let name = 'svelecte';
  export let inputId = null;
  export let required = false;
  export let hasAnchor = false;
  export let disabled = defaults.disabled;
  // basic
  export let options = [];
  export let valueField = defaults.valueField;
  export let labelField = defaults.labelField;
  export let groupLabelField = defaults.groupLabelField;
  export let groupItemsField = defaults.groupItemsField;
  export let disabledField = defaults.disabledField;
  export let placeholder = 'Select';
  // UI, UX
  export let searchable = defaults.searchable;
  export let clearable = defaults.clearable;
  export let renderer = null;
  export let disableHighlight = false;
  export let highlightFirstItem = defaults.highlightFirstItem;
  export let selectOnTab = defaults.selectOnTab;
  export let resetOnBlur = defaults.resetOnBlur;
  export let resetOnSelect = defaults.resetOnSelect;
  export let closeAfterSelect = defaults.closeAfterSelect;
  export let dndzone = () => ({ noop: true, destroy: () => {}});
  export let validatorAction = null;
  export let dropdownItem = Item;
  export let controlItem = Item;
  // multiple
  export let multiple = defaults.multiple;
  export let max = defaults.max;
  export let collapseSelection = defaults.collapseSelection;
  export let alwaysCollapsed = defaults.alwaysCollapsed;
  // creating
  export let creatable = defaults.creatable;
  export let creatablePrefix = defaults.creatablePrefix;
  export let allowEditing = defaults.allowEditing;
  export let keepCreated = defaults.keepCreated;
  export let delimiter = defaults.delimiter;
  export let createFilter = null;
  export let createTransform = null;
  // remote
  export let fetch = null;
  export let fetchMode = 'auto';
  export let fetchCallback = defaults.fetchCallback;
  export let fetchResetOnBlur = true;
  export let minQuery = defaults.minQuery;
  // performance
  export let lazyDropdown = defaults.lazyDropdown;
  // virtual list
  export let virtualList = defaults.virtualList;
  export let vlHeight = defaults.vlHeight;
  export let vlItemSize = defaults.vlItemSize;
  // sifter related
  export let searchField = null;
  export let sortField = null;
  export let disableSifter = false;
  // styling
  let className = 'svelecte-control';
  export { className as class};
  export let style = null;
  // i18n override
  export let i18n = null;
  // API: public
  export let readSelection = null;
  export let value = null;
  export let labelAsValue = false;
  export let valueAsObject = defaults.valueAsObject;
  export let parentValue = undefined;
  export const focus = event => {
    refControl.focusControl(event);
  };
  export const getSelection = onlyValues => {
    if (!selectedOptions.length) return multiple ? [] : null;
    const _selection = selectedOptions.map(opt => onlyValues
      ? opt[labelAsValue ? currentLabelField : currentValueField]
      : Object.assign({}, opt));
    return multiple ? _selection : _selection[0];
  };
  export const setSelection = (selection, triggerChangeEvent) => {
    handleValueUpdate(selection);
    triggerChangeEvent && emitChangeEvent();
  }
  // API: internal for CE
  export const clearByParent = doDisable => {
    clearSelection();
    emitChangeEvent();
    if (doDisable) {
      disabled = true;
      fetch = null;
    }
  }

  const __id = `sv-select-${Math.random()}`.replace('.', '');
  const dispatch = createEventDispatcher();

  const itemConfig = {
    optionsWithGroups: false,
    isOptionArray: options && options.length && typeof options[0] !== 'object',
    optionProps: [],
    valueField: valueField,
    labelField: labelField,
    labelAsValue: labelAsValue,
    optLabel: groupLabelField,
    optItems: groupItemsField
  };
  /* possibility to provide initial (selected) values in `fetch` mode **/
  if (fetch && value && valueAsObject && (!options || (options && options.length === 0))) {
    options = Array.isArray(value) ? value : [value];
  }
  let isInitialized = false;
  let refDropdown;
  let refControl;
  let ignoreHover = false;
  let dropdownActiveIndex = null;
  let currentValueField = valueField || fieldInit('value', options, itemConfig);
  let currentLabelField = labelField || fieldInit('label', options, itemConfig);
  let isIOS = false;
  let isAndroid = false;
  let refSelectAction = validatorAction ? validatorAction.shift() : () => ({ destroy: () => {}});
  let refSelectActionParams = validatorAction || [];
  let refSelectElement = null;

  itemConfig.valueField = currentValueField;
  itemConfig.labelField = currentLabelField;
  itemConfig.optionProps = value && valueAsObject && (multiple && Array.isArray(value) ? value.length > 0 : true)
    ? getFilterProps(multiple ? value.slice(0,1).shift() : value)
    : [currentValueField, currentLabelField];

  /** ************************************ automatic init */
  multiple = name && !multiple ? name.endsWith('[]') : multiple;
  if (!createFilter) createFilter = defaultCreateFilter;
  $: if (!createTransform) createTransform = defaultCreateTransform;
  $: {
    if (parentValue !== internalParentValue) {
      handleValueUpdate();
      disabled = !parentValue ? true : false;
    }
    internalParentValue = parentValue;
  }
  let internalParentValue = undefined;
 
  /** ************************************ Context definition */
  const inputValue = writable('');
  const hasFocus = writable(false);
  const hasDropdownOpened = writable(false);

  /** ************************************ remote source */
  let isFetchingData = false;
  let initFetchOnly = fetchMode === 'init' || (fetchMode === 'auto' && typeof fetch === 'string' && fetch.indexOf('[query]') === -1);
  let fetchInitValue = initFetchOnly ? value : null;
  let fetchUnsubscribe = null;
  $: createFetch(fetch);
  $: disabled && hasDropdownOpened.set(false);

  function cancelXhr() {
    if (isInitialized && isFetchingData) {
      xhr && ![0,4].includes(xhr.readyState) && xhr.abort();
      isFetchingData = false;
    }
    return true;
  }

  function createFetch(fetch) {
    if (fetchUnsubscribe) {
      fetchUnsubscribe();
      fetchUnsubscribe = null;
    }
    if (!fetch) return null;
    cancelXhr();

    // update fetchInitValue when fetch is changed, but we are in 'init' mode, ref #113
    if (initFetchOnly && prevValue) fetchInitValue = prevValue;

    const fetchSource = typeof fetch === 'string' ? fetchRemote(fetch) : fetch;
    // reinit this if `fetch` property changes
    initFetchOnly = fetchMode === 'init' || (fetchMode === 'auto' && typeof fetch === 'string' && fetch.indexOf('[query]') === -1);
    const debouncedFetch = debounce(query => {
      if (query && !$inputValue.length) {
        isFetchingData = false;
        return;
      }
      fetchSource(query, fetchCallback)
        .then(data => {
          if (!Array.isArray(data)) {
            console.warn('[Svelecte]:Fetch - array expected, invalid property provided:', data);
            data = [];
          }
          options = data;
        })
        .catch(() => {
          options = []
        })
        .finally(() => {
          isFetchingData = false;
          $hasFocus && hasDropdownOpened.set(true);
          listMessage = _i18n.fetchEmpty;
          tick().then(() => {
            if (initFetchOnly && fetchInitValue) {
              handleValueUpdate(fetchInitValue);
              fetchInitValue = null;
            }
            dispatch('fetch', options)
          });
        })
    }, 500);

    if (initFetchOnly) {
      if (typeof fetch === 'string' && fetch.indexOf('[parent]') !== -1) return null;
      isFetchingData = true;
      options = [];
      debouncedFetch(null);
      return null;
    }

    fetchUnsubscribe = inputValue.subscribe(value => {
      cancelXhr(); // cancel previous run
      if (!value) {
        if (isInitialized && fetchResetOnBlur) {
          options = [];
        }
        return;
      }
      if (value && value.length < minQuery) return;
      !initFetchOnly && hasDropdownOpened.set(false);
      isFetchingData = true;
      debouncedFetch(value);
    });

    return debouncedFetch;
  }

  /** ************************************ component logic */

  let prevValue = value;
  let _i18n = config.i18n;

  $: {
    if (i18n && typeof i18n === 'object') {
      _i18n = Object.assign({}, config.i18n, i18n);
    }
  }

  /** - - - - - - - - - - STORE - - - - - - - - - - - - - -*/
  let selectedOptions = value !== null ? initSelection.call(options, value, valueAsObject, itemConfig) : [];
  let selectedKeys = selectedOptions.reduce((set, opt) => { set.add(opt[currentValueField]); return set; }, new Set());
  let alreadyCreated = [''];
  $: flatItems = flatList(options, itemConfig);
  $: prevValue !== value && handleValueUpdate(value);
  $: maxReached = max && selectedOptions.length == max;   // == is intentional, if string is provided
  $: availableItems = maxReached
    ? []
    : filterList(flatItems, disableSifter ? null : $inputValue, multiple ? selectedKeys : false, searchField, sortField, itemConfig);
  $: currentListLength = creatable && $inputValue ? availableItems.length : availableItems.length - 1;
  $: listIndex = indexList(availableItems, creatable && $inputValue, itemConfig);
  $: {
    if (dropdownActiveIndex === null && (highlightFirstItem || $inputValue)) {
      dropdownActiveIndex = listIndex.first;
    } else if (dropdownActiveIndex > listIndex.last) {
      dropdownActiveIndex = listIndex.last;
    } else if (dropdownActiveIndex < listIndex.first) {
      dropdownActiveIndex = listIndex.first;
    }
  }
  $: listMessage = maxReached
    ? _i18n.max(max)
    : ($inputValue.length && availableItems.length === 0 && minQuery <= 1
      ? _i18n.nomatch
      : (fetch
        ? (minQuery <= 1
          ? (initFetchOnly
            ? (isFetchingData
              ? _i18n.fetchInit
              : _i18n.empty
              )
            : _i18n.fetchBefore
            )
          : _i18n.fetchQuery(minQuery, $inputValue.length)
        )
        : _i18n.empty
      )
    );
  $: itemRenderer = typeof renderer === 'function' ? renderer : (formatterList[renderer] || formatterList.default.bind({ label: currentLabelField}));
  $: {
    const _selectionArray = selectedOptions
      .map(opt => {
        const { '$disabled': unused1,  '$isGroupItem': unused2, ...obj } = opt;
        return obj;
      });
    const _unifiedSelection = multiple
      ? _selectionArray
      : (_selectionArray.length ? _selectionArray[0] : null);
    const valueProp = itemConfig.labelAsValue ? currentLabelField : currentValueField;

    if (!valueAsObject) {
      prevValue = multiple
        ? _unifiedSelection.map(opt => opt[valueProp])
        : selectedOptions.length ? _unifiedSelection[valueProp] : null;
    } else {
      prevValue = _unifiedSelection;
    }
    value = prevValue;
    readSelection = _unifiedSelection;
  }
  let prevOptions = options;
  $: {
    if (isInitialized && prevOptions !== options && options.length) {
      const ivalue = fieldInit('value', options || null, itemConfig);
      const ilabel = fieldInit('label', options || null, itemConfig);
      if (!valueField && currentValueField !== ivalue) itemConfig.valueField = currentValueField = ivalue;
      if (!labelField && currentLabelField !== ilabel) itemConfig.labelField = currentLabelField = ilabel;
    }
  }
  $: {
    itemConfig.labelAsValue = labelAsValue;
  }
  $: dropdownInputValue = createFilter($inputValue, options);

  /**
   * Dispatch change event on add options/remove selected items
   */
  function emitChangeEvent() {
    tick().then(() => {
      dispatch('change', readSelection);
      if (refSelectElement) {
        refSelectElement.dispatchEvent(new Event('input'));   // required for svelte-use-form
        refSelectElement.dispatchEvent(new Event('change'));  // typically you expect change event to be fired
      }
    });
  }

  /**
   * Dispatch createoption event when user creates a new entry (with 'creatable' feature)
   */
  function emitCreateEvent(createdOpt) {
      dispatch('createoption', createdOpt)
  }

  /**
   * update inner selection, when 'value' property is changed
   *
   * @internal before 3.9.1 it was possible when `valueAsObject` was set to set value OUTSIDE defined options. Fix at
   * 3.9.1 broke manual value setter. Which has been resolved now through #128. Which disables pre 3.9.1 behavior
   *
   * FUTURE: to enable this behavior add property for it. Could be useful is some edge cases I would say.
   */
  function handleValueUpdate(passedVal) {
    clearSelection();
    if (passedVal) {
      let _selection = Array.isArray(passedVal) ? passedVal : [passedVal];
      const valueProp = itemConfig.labelAsValue ? currentLabelField : currentValueField;
      _selection = _selection.reduce((res, val) => {
        if (creatable && valueAsObject && val.$created) {
          res.push(val);
          return res;
        }
        const opt = flatItems.find(item => valueAsObject
          ? item[valueProp] == val[valueProp]
          : item[valueProp] == val
        );
        opt && res.push(opt);
        return res;
      }, []);
      let success = _selection.every(selectOption) && (multiple
        ? passedVal.length === _selection.length
        : _selection.length > 0
      );
      if (!success) {
        // this is run only when invalid 'value' is provided, like out of option array
        console.warn('[Svelecte]: provided "value" property is invalid', passedVal);
        value = multiple ? [] : null;
        readSelection = value;
        dispatch('invalidValue', passedVal);
        return;
      }
      readSelection = Array.isArray(passedVal) ? _selection : _selection.shift();
    }
    prevValue = passedVal;
  }

  /**
   * Add given option to selection pool
   * Check if not already selected or max item selection reached
   *
   * @returns bool
   */
  function selectOption(opt) {
    if (!opt || (multiple && maxReached)) return false;
    if (selectedKeys.has(opt[currentValueField])) return;

    if (typeof opt === 'string') {
      if (!creatable) return;
      opt = createFilter(opt, options);
      if (alreadyCreated.includes(opt)) return;
      !fetch && alreadyCreated.push(opt);
      opt = createTransform(opt, creatablePrefix, currentValueField, currentLabelField);
      opt.$created = true;  // internal setter
      if (keepCreated) options = [...options, opt];
      emitCreateEvent(opt);
    }
    if (multiple) {
      selectedOptions.push(opt);
      selectedOptions = selectedOptions;
      selectedKeys.add(opt[currentValueField]);
    } else {
      selectedOptions = [opt];
      selectedKeys.clear();
      selectedKeys.add(opt[currentValueField]);
      dropdownActiveIndex = options.indexOf(opt);
    }
    flatItems = flatItems;
    return true;
  }

  /**
   * Remove option/all options from selection pool
   */
  function deselectOption(opt) {
    if (opt.$created && backspacePressed && allowEditing) {
      alreadyCreated.splice(alreadyCreated.findIndex(o => o === opt[labelAsValue ? currentLabelField : currentValueField]), 1);
      alreadyCreated = alreadyCreated;
      if (keepCreated) {
        options.splice(options.findIndex(o => o === opt), 1);
        options = options;
      }
      $inputValue = opt[currentLabelField].replace(creatablePrefix, '');
    }
    const id = opt[currentValueField];
    selectedKeys.delete(id);
    selectedOptions.splice(selectedOptions.findIndex(o => o[currentValueField] == id), 1);
    selectedOptions = selectedOptions;
    flatItems = flatItems;
  }

  export function clearSelection() {
    selectedKeys.clear();
    selectedOptions = [];
    maxReached = false;       // reset forcefully, related to #145
    flatItems = flatItems;
  }

  /**
   * Handle user action on select
   */
  function onSelect(event, opt) {
    opt = opt || event.detail;
    if (disabled || opt[disabledField] || opt.$isGroupHeader) return;

    selectOption(opt);
    if ((multiple && resetOnSelect) || !multiple) $inputValue = '';
    if (!multiple || closeAfterSelect) {
      $hasDropdownOpened = false;
    } else {
      tick().then(() => {
        dropdownActiveIndex = maxReached
          ? null
          : listIndex.next(dropdownActiveIndex - 1, true);
      })
    }
    emitChangeEvent();
  }

  function onDeselect(event, opt) {
    if (disabled) return;
    opt = opt || event.detail;
    if (opt) {
      deselectOption(opt);
    } else {  // apply for 'x' when clearable:true || ctrl+backspace || ctrl+delete
      clearSelection();
    }
    tick().then(refControl.focusControl);
    emitChangeEvent();
  }

  /**
   * Dropdown hover handler - update active item
   */
  function onHover(event) {
    if (ignoreHover) {
      ignoreHover = false;
      return;
    }
    dropdownActiveIndex = event.detail;
  }

  /** keyboard related props */
  let backspacePressed = false;

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
    const Tab = selectOnTab && $hasDropdownOpened && !event.shiftKey ? 'Tab' : 'No-tab';
    let ctrlKey = isIOS ? event.metaKey : event.ctrlKey;
    let isPageEvent = ['PageUp', 'PageDown'].includes(event.key);
    switch (event.key) {
      case 'End':
        if ($inputValue.length !== 0) return;
        dropdownActiveIndex = listIndex.first;
      case 'PageDown':
        if (isPageEvent) {
          const [wrap, item] = refDropdown.getDimensions();
          dropdownActiveIndex = Math.ceil((item * dropdownActiveIndex + wrap) / item);
        }
      case 'ArrowUp':
        event.preventDefault();
        if (!$hasDropdownOpened) {
          $hasDropdownOpened = true;
          if (dropdownActiveIndex === null) {
            dropdownActiveIndex = listIndex.first
          }
          return;
        }
        dropdownActiveIndex = listIndex.prev(dropdownActiveIndex);
        tick().then(refDropdown.scrollIntoView);
        ignoreHover = true;
        break;
      case 'Home':
        if ($inputValue.length !== 0
          || ($inputValue.length === 0 && availableItems.length === 0)  // ref #26
        ) return;
        dropdownActiveIndex = listIndex.last;
      case 'PageUp':
        if (isPageEvent) {
          const [wrap, item] = refDropdown.getDimensions();
          dropdownActiveIndex = Math.floor((item * dropdownActiveIndex - wrap) / item);
        }
      case 'ArrowDown':
        event.preventDefault();
        if (!$hasDropdownOpened) {
          $hasDropdownOpened = true;
          if (dropdownActiveIndex === null) {
            dropdownActiveIndex = listIndex.first
          }
          return;
        }
        dropdownActiveIndex = dropdownActiveIndex === null ? listIndex.first : listIndex.next(dropdownActiveIndex);
        tick().then(refDropdown.scrollIntoView);
        ignoreHover = true;
        break;
      case 'Escape':
        if ($hasDropdownOpened) { // prevent ESC bubble in this case (interfering with modal closing etc. (bootstrap))
          event.preventDefault();
          event.stopPropagation();
        }
        if (!$inputValue) {
          $hasDropdownOpened = false;
        }
        cancelXhr();
        $inputValue = '';
        break;
      case Tab:
      case 'Enter':
        if (!$hasDropdownOpened) {
          event.key !== Tab && dispatch('enterKey', event); // ref #125
          return;
        }
        let activeDropdownItem = !ctrlKey ? availableItems[dropdownActiveIndex] : null;
        if (creatable && $inputValue) {
          activeDropdownItem = !activeDropdownItem || ctrlKey
            ? $inputValue
            : activeDropdownItem
          ctrlKey = false;
        }
        !ctrlKey && activeDropdownItem && onSelect(null, activeDropdownItem);
        if (availableItems.length <= dropdownActiveIndex) {
          dropdownActiveIndex = currentListLength > 0 ? currentListLength : listIndex.first;
        }
        if (!activeDropdownItem && selectedOptions.length) {
          $hasDropdownOpened = false;
          event.key !== Tab && dispatch('enterKey', event); // ref #125
          return;
        }
        (event.key !== Tab || (event.key === Tab && selectOnTab !== TAB_SELECT_NAVIGATE)) && event.preventDefault(); // prevent form submit
        break;
      case ' ':
        if (!fetch && !$hasDropdownOpened) {
          $hasDropdownOpened = true;
          event.preventDefault();
        }
        if (!multiple && selectedOptions.length) event.preventDefault();
        break;
      case 'Backspace':
        backspacePressed = true;
      case 'Delete':
        if ($inputValue === '' && selectedOptions.length) {
          ctrlKey ? onDeselect({ /** no detail prop */}) : onDeselect(null, selectedOptions[selectedOptions.length - 1]);
          event.preventDefault();
        }
        backspacePressed = false;
      default:
        if (!ctrlKey && !['Tab', 'Shift'].includes(event.key) && !$hasDropdownOpened && !isFetchingData) {
          $hasDropdownOpened = true;
        }
        if (!multiple && selectedOptions.length && event.key !== 'Tab') {
          event.preventDefault();
          event.stopPropagation();
        }
    }
  }

  /**
   * Enable create items by pasting
   */
  function onPaste(event) {
    if (creatable) {
      event.preventDefault();
      const rx = new RegExp('([^' + delimiter + '\\n]+)', 'g');
      const pasted = event.clipboardData
        .getData('text/plain')
          .replace(/\//g, '\/')
          .replace(/\t/g, ' ');
      const matches = pasted.match(rx);
      if (matches.length === 1 && pasted.indexOf(',') === -1) {
        $inputValue = matches.pop().trim();
      }
      matches.forEach(opt  => onSelect(null, opt.trim()));
    }
    // do nothing otherwise
  }

  function onDndEvent(e) {
    selectedOptions = e.detail.items;
  }

  /** ************************************ component lifecycle related */

  onMount(() => {
    isInitialized = true;
    if (creatable) {
      const valueProp = itemConfig.labelAsValue ? currentLabelField : currentValueField;
      alreadyCreated = [''].concat(flatItems.map(opt => opt[valueProp]).filter(opt => opt));
    }
    if (prevValue && !multiple) {
      const prop = labelAsValue ? currentLabelField : currentValueField;
      const selectedProp = valueAsObject ? prevValue[prop] : prevValue;
      dropdownActiveIndex = flatItems.findIndex(opt => opt[prop] === selectedProp);
    }
    isIOS = iOS();
    isAndroid = android();
    if (name && !hasAnchor) refSelectElement = document.getElementById(__id);
  });
</script>

<div class={`svelecte ${className}`} class:is-disabled={disabled} {style}>
  <Control bind:this={refControl} renderer={itemRenderer}
    {disabled} {clearable} {searchable} {placeholder} {multiple} inputId={inputId || __id} {resetOnBlur} collapseSelection={collapseSelection ? config.collapseSelectionFn.bind(_i18n): null}
    inputValue={inputValue} hasFocus={hasFocus} hasDropdownOpened={hasDropdownOpened} selectedOptions={selectedOptions} {isFetchingData}
    {dndzone} {currentValueField} {isAndroid} {isIOS} {alwaysCollapsed}
    itemComponent={controlItem}
    on:deselect={onDeselect}
    on:keydown={onKeyDown}
    on:paste={onPaste}
    on:consider={onDndEvent}
    on:finalize={onDndEvent}
    on:blur
  >
    <div slot="icon" class="icon-slot"><slot name="icon"></slot></div>
    <div slot="control-end"><slot name="control-end"></slot></div>
    <slot name="indicator-icon" slot="indicator-icon" let:hasDropdownOpened {hasDropdownOpened}>
      <svg width="20" height="20" class="indicator-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
        <path d="M4.516 7.548c0.436-0.446 1.043-0.481 1.576 0l3.908 3.747 3.908-3.747c0.533-0.481 1.141-0.446 1.574 0 0.436 0.445 0.408 1.197 0 1.615-0.406 0.418-4.695 4.502-4.695 4.502-0.217 0.223-0.502 0.335-0.787 0.335s-0.57-0.112-0.789-0.335c0 0-4.287-4.084-4.695-4.502s-0.436-1.17 0-1.615z"></path>
      </svg>
    </slot>
    <slot name="select-icon" slot="select-icon" let:hasDropdownOpened hasDropdownOpened={hasDropdownOpened} inputValue={$inputValue}></slot>
    <slot name="clear-icon" slot="clear-icon" {selectedOptions} inputValue={$inputValue} let:hasDropdownOpened hasDropdownOpened={hasDropdownOpened}>
      {#if selectedOptions.length}
        <svg class="indicator-icon" height="20" width="20" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="M14.348 14.849c-0.469 0.469-1.229 0.469-1.697 0l-2.651-3.030-2.651 3.029c-0.469 0.469-1.229 0.469-1.697 0-0.469-0.469-0.469-1.229 0-1.697l2.758-3.15-2.759-3.152c-0.469-0.469-0.469-1.228 0-1.697s1.228-0.469 1.697 0l2.652 3.031 2.651-3.031c0.469-0.469 1.228-0.469 1.697 0s0.469 1.229 0 1.697l-2.758 3.152 2.758 3.15c0.469 0.469 0.469 1.229 0 1.698z"></path></svg>
      {/if}
    </slot>
  </Control>
<Dropdown bind:this={refDropdown} renderer={itemRenderer} {disableHighlight} {creatable} {maxReached} {alreadyCreated}
  {virtualList} {vlHeight} {vlItemSize} lazyDropdown={virtualList || lazyDropdown} {multiple}
  dropdownIndex={dropdownActiveIndex}
  items={availableItems} {listIndex}
  inputValue={dropdownInputValue} {hasDropdownOpened} {listMessage} {disabledField} createLabel={_i18n.createRowLabel}
  metaKey={isIOS ? '⌘' : 'Ctrl'}
  selection={collapseSelection && alwaysCollapsed ? selectedOptions : null}
  itemComponent={dropdownItem}
  on:select={onSelect}
  on:deselect={onDeselect}
  on:hover={onHover}
  on:createoption
  let:item={item}
></Dropdown>
  {#if name && !hasAnchor}
  <select id={__id} name={name} {multiple} class="sv-hidden-element" tabindex="-1" {required} {disabled} use:refSelectAction={refSelectActionParams}>
    {#each selectedOptions as opt}
    <option value={opt[labelAsValue ? currentLabelField : currentValueField]} selected>{opt[currentLabelField]}</option>
    {/each}
  </select>
  {/if}
</div>

<style>
  .svelecte-control {
    --sv-bg: #fff;
    --sv-color: inherit;
    --sv-min-height: 38px;
    --sv-border-color: #ccc;
    --sv-border: 1px solid var(--sv-border-color);
    --sv-active-border: 1px solid #555;
    --sv-active-outline: none;
    --sv-disabled-bg: #f2f2f2;
    --sv-disabled-border-color: #e6e6e6;
    --sv-placeholder-color: #ccccc6;
    --sv-icon-color: #ccc;
    --sv-icon-hover: #999;
    --sv-loader-border: 3px solid #dbdbdb;
    --sv-dropdown-shadow: 0 6px 12px rgba(0,0,0,0.175);
    --sv-dropdown-height: 250px;
    --sv-item-selected-bg: #efefef;
    --sv-item-color: #333333;
    --sv-item-active-color: var(--sv-item-color);
    --sv-item-active-bg: #F2F5F8;
    --sv-item-btn-bg: var(--sv-item-selected-bg);
    --sv-item-btn-bg-hover: #ddd;
    --sv-item-btn-icon: var(--sv-item-color);
    --sv-highlight-bg: yellow;
    --sv-highlight-color: var(--sv-item-color);
  }
  .svelecte { position: relative; flex: 1 1 auto; color: var(--sv-color);}
  .svelecte.is-disabled { pointer-events: none; }
  .icon-slot { display: flex; }
  .sv-hidden-element { opacity: 0; position: absolute; z-index: -2; top: 0; height: var(--sv-min-height)}

  /** globally available styles for control/dropdown Item components */
  :global(.svelecte-control .has-multiSelection .sv-item),
  :global(#dnd-action-dragged-el .sv-item) {
    background-color: var(--sv-item-selected-bg);
    margin: 2px 4px 2px 0;
  }
  :global(.svelecte-control .has-multiSelection .sv-item-content),
  :global(.svelecte-control .sv-dropdown-content .sv-item),
  :global(#dnd-action-dragged-el .sv-item-content) {
    padding: 3px 3px 3px 6px;
  }
  :global(.svelecte-control .sv-item),
  :global(#dnd-action-dragged-el .sv-item) {
    display: flex;
    min-width: 0px;
    box-sizing: border-box;
    border-radius: 2px;
    cursor: default;
  }
  :global(.svelecte-control .sv-item.is-disabled) { opacity: 0.5; cursor: not-allowed; }

  :global(.svelecte-control .sv-item-content),
  :global(#dnd-action-dragged-el .sv-item-content) {
    color: var(--sv-item-color, var(--sv-color));
    text-overflow: ellipsis;
    white-space: nowrap;
    box-sizing: border-box;
    border-radius: 2px;
    overflow: hidden;
    width: 100%;
  }
  :global(.svelecte-control .sv-dd-item-active > .sv-item) {
    background-color: var(--sv-item-active-bg);
  }
  :global(.svelecte-control .sv-dd-item-active > .sv-item .sv-item-content) {
    color: var(--sv-item-active-color, var(--sv-item-color));
  }
  :global(.svelecte-control .highlight) {
    background-color: var(--sv-highlight-bg);
    color: var(--sv-highlight-color, var(--sv-color));
  }
  .indicator-icon {
    display: inline-block;
    fill: currentcolor;
    line-height: 1;
    stroke: currentcolor;
    stroke-width: 0px;
  }
</style>
