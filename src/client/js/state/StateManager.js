/**
 * @fileoverview State Manager
 * Observable, immutable state management with action dispatch system
 * Features change detection, action-based updates, debugging, type safety
 * @module StateManager
 */

/**
 * Observable State Manager with Action Dispatch System
 * Provides immutable state updates with change detection and debugging
 * 
 * Key Features:
 * - Immutable updates prevent accidental mutations
 * - Observer pattern enables reactive UI updates  
 * - Action-based changes make state flow predictable
 * - Built-in debugging and state history
 * - Redux-style dispatch system
 * - No external dependencies
 */
class StateManager {
  constructor(initialState = {}) {
    // Private properties - not accessible from outside
    this._state = Object.freeze({ ...initialState });
    this._observers = new Map(); // topic -> Set of callbacks
    this._history = []; // For debugging
    this._actions = new Map(); // actionName -> actionHandler
    this._isProduction = process.env.NODE_ENV === 'production';
    
    // Enable debugging in development
    if (!this._isProduction) {
      this._enableDebugging();
    }
  }

  /**
   * Add an action handler to the state manager
   * @param {string} actionName - Name of the action
   * @param {Function} actionHandler - Function that takes (state, payload) and returns new state
   */
  addAction(actionName, actionHandler) {
    if (typeof actionHandler !== 'function') {
      throw new Error(`Action handler for "${actionName}" must be a function`);
    }
    
    this._actions.set(actionName, actionHandler);
    
    if (!this._isProduction) {
      console.log(`📝 Registered action: ${actionName}`);
    }
  }

  /**
   * Dispatch an action to update state
   * @param {string} actionName - Name of the action to dispatch
   * @param {*} payload - Payload to pass to the action handler
   * @returns {Object} New state after action
   */
  dispatch(actionName, payload) {
    const actionHandler = this._actions.get(actionName);
    
    if (!actionHandler) {
      throw new Error(`Unknown action: ${actionName}. Available actions: ${Array.from(this._actions.keys()).join(', ')}`);
    }

    try {
      const previousState = this._state;
      const newState = actionHandler(previousState, payload);
      
      if (!newState || typeof newState !== 'object') {
        throw new Error(`Action "${actionName}" must return a valid state object`);
      }

      // Update state immutably
      this._state = Object.freeze(newState);

      // Track history for debugging
      if (!this._isProduction) {
        this._addToHistory(actionName, payload, previousState, this._state);
      }

      // Notify observers of the changes
      const changes = this._getChanges(previousState, this._state);
      this._notifyObservers(changes, previousState, this._state, actionName);

      return this._state;
      
    } catch (error) {
      console.error(`Error dispatching action "${actionName}":`, error);
      throw error;
    }
  }

  /**
   * Get current state (immutable copy)
   * @returns {Object} Current state snapshot
   */
  getState() {
    return { ...this._state };
  }

  /**
   * Get specific state property
   * @param {string} key - Property key
   * @returns {*} Property value
   */
  get(key) {
    return this._state[key];
  }

  /**
   * Subscribe to state changes
   * @param {string|Array} topics - Topic name to watch ('*' for all)
   * @param {Function} callback - Function to call on changes
   * @returns {Function} Unsubscribe function
   */
  subscribe(topics, callback) {
    if (!callback || typeof callback !== 'function') {
      throw new Error('StateManager.subscribe requires a callback function');
    }

    // Normalize topics to array
    const topicList = Array.isArray(topics) ? topics : [topics];
    
    // Store callback for each topic
    topicList.forEach(topic => {
      if (!this._observers.has(topic)) {
        this._observers.set(topic, new Set());
      }
      this._observers.get(topic).add(callback);
    });

    // Return unsubscribe function
    return () => {
      topicList.forEach(topic => {
        const observers = this._observers.get(topic);
        if (observers) {
          observers.delete(callback);
          if (observers.size === 0) {
            this._observers.delete(topic);
          }
        }
      });
    };
  }

  /**
   * Update state immutably (legacy method for compatibility)
   * @param {Object} updates - Object with updates to apply
   * @param {string} [action='UPDATE'] - Action name for debugging
   * @returns {Object} New state
   */
  setState(updates, action = 'UPDATE') {
    if (!updates || typeof updates !== 'object') {
      throw new Error('StateManager.setState requires an updates object');
    }

    // Create new immutable state
    const previousState = this._state;
    const newState = Object.freeze({
      ...previousState,
      ...updates
    });

    this._state = newState;

    // Track history for debugging
    if (!this._isProduction) {
      this._addToHistory(action, updates, previousState, newState);
    }

    // Notify observers
    this._notifyObservers(updates, previousState, newState, action);

    return newState;
  }

  /**
   * Update nested state properties
   * @param {string} key - Top-level key to update
   * @param {Object} updates - Nested updates to apply
   * @param {string} [action='UPDATE_NESTED'] - Action name
   * @returns {Object} New state
   */
  updateNested(key, updates, action = 'UPDATE_NESTED') {
    const currentValue = this._state[key] || {};
    
    if (typeof currentValue !== 'object') {
      throw new Error(`Cannot update non-object property: ${key}`);
    }

    return this.setState({
      [key]: { ...currentValue, ...updates }
    }, action);
  }

  /**
   * Reset specific properties to initial values
   * @param {Array} keys - Keys to reset
   * @param {Object} initialState - Initial state to reset to
   * @param {string} [action='RESET'] - Action name
   */
  reset(keys, initialState, action = 'RESET') {
    const updates = {};
    keys.forEach(key => {
      if (initialState.hasOwnProperty(key)) {
        updates[key] = initialState[key];
      }
    });
    
    return this.setState(updates, action);
  }

  /**
   * Batch multiple updates into single notification
   * @param {Function} updateFn - Function that performs multiple setState calls
   * @param {string} [action='BATCH_UPDATE'] - Action name
   */
  batch(updateFn, action = 'BATCH_UPDATE') {
    const originalNotify = this._notifyObservers;
    const updates = {};
    const startState = this._state;

    // Temporarily disable notifications
    this._notifyObservers = () => {};

    try {
      // Collect all updates
      const originalSetState = this.setState.bind(this);
      this.setState = (stateUpdates) => {
        Object.assign(updates, stateUpdates);
        return originalSetState(stateUpdates);
      };

      // Execute batched updates
      updateFn();

      // Restore original setState
      this.setState = originalSetState;
    } finally {
      // Restore notification system
      this._notifyObservers = originalNotify;
    }

    // Send single notification for all changes
    this._notifyObservers(updates, startState, this._state, action);
  }

  // Private methods
  _getChanges(previousState, newState) {
    const changes = {};
    
    // Find all changed keys
    const allKeys = new Set([...Object.keys(previousState), ...Object.keys(newState)]);
    
    allKeys.forEach(key => {
      if (previousState[key] !== newState[key]) {
        changes[key] = newState[key];
      }
    });
    
    return changes;
  }

  _notifyObservers(updates, previousState, newState, action) {
    const changedKeys = Object.keys(updates);
    
    // Notify specific property observers
    changedKeys.forEach(key => {
      const observers = this._observers.get(key);
      if (observers) {
        observers.forEach(callback => {
          try {
            callback({
              key,
              previousValue: previousState[key],
              newValue: newState[key],
              allChanges: updates,
              action
            });
          } catch (error) {
            console.error(`StateManager observer error for key "${key}":`, error);
          }
        });
      }
    });

    // Notify global observers (subscribed to '*')
    const globalObservers = this._observers.get('*');
    if (globalObservers) {
      globalObservers.forEach(callback => {
        try {
          callback({
            previousState,
            newState,
            changes: updates,
            action
          });
        } catch (error) {
          console.error('StateManager global observer error:', error);
        }
      });
    }
  }

  _addToHistory(action, payload, previousState, newState) {
    this._history.push({
      timestamp: Date.now(),
      action,
      payload,
      previousState: { ...previousState },
      newState: { ...newState }
    });

    // Keep last 50 state changes
    if (this._history.length > 50) {
      this._history.shift();
    }
  }

  _enableDebugging() {
    // Add debugging methods to window in development
    if (typeof window !== 'undefined') {
      window.__SLOPS_STATE_DEBUG = {
        getState: () => this.getState(),
        getHistory: () => [...this._history],
        getActions: () => Array.from(this._actions.keys()),
        getObservers: () => {
          const result = {};
          this._observers.forEach((observers, topic) => {
            result[topic] = observers.size;
          });
          return result;
        },
        logHistory: () => {
          console.group('🔍 State History');
          this._history.forEach((entry, index) => {
            console.log(`${index + 1}. ${entry.action}`, {
              timestamp: new Date(entry.timestamp).toLocaleTimeString(),
              payload: entry.payload,
              state: entry.newState
            });
          });
          console.groupEnd();
        },
        dispatch: (action, payload) => this.dispatch(action, payload)
      };

      console.log('🐛 State debugging enabled. Use window.__SLOPS_STATE_DEBUG');
    }
  }
}

/**
 * Action creators for common state operations (legacy compatibility)
 */
export const StateActions = {
  // App state actions
  setLoading: (isLoading) => ({ isLoading }),
  setCurrentPage: (page) => ({ currentPage: page }),
  setTotalPages: (totalPages) => ({ totalPages }),
  
  // Filter actions  
  updateFilters: (filterUpdates) => ({ 
    filters: (currentFilters) => ({ ...currentFilters, ...filterUpdates })
  }),
  resetFilters: (initialFilters) => ({ filters: { ...initialFilters } }),
  
  // Search actions
  setSearchInstance: (instance) => ({ searchInstance: instance }),
  setFiltersInitialized: (initialized) => ({ filtersInitialized: initialized }),
  
  // Scroll actions
  setScrollPosition: (position) => ({ lastScrollPosition: position }),
  setPreventScroll: (prevent) => ({ preventNextScroll: prevent })
};

/**
 * Create configured app state manager
 * @returns {StateManager} Configured state manager instance
 */
export function createAppStateManager() {
  const initialState = {
    // Pagination
    currentPage: 1,
    totalPages: 0,
    
    // Loading states
    isLoading: false,
    
    // Filter state
    filters: {
      hasOptions: true,
      showAll: false,
      search: '',
      category: '',
      developer: '',
      engine: '',
      options: '',
      year: '',
      sort: 'title',
      order: 'asc'
    },
    
    // Component state
    searchInstance: null,
    filtersInitialized: false,
    
    // UI state
    lastScrollPosition: 0,
    preventNextScroll: false,
    
    // Statistics
    gameStats: {
      withOptions: 0,
      withoutOptions: 0,
      total: 0
    },
    
    // Error state
    error: null,
    
    // Data state
    games: [],
    facets: null
  };

  return new StateManager(initialState);
}

export { StateManager };