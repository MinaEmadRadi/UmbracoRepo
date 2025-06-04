// Patch to prevent unwanted tour guide dialog and backdrops
(function () {
    let cleanupTimeout;
    let observer;
    let retryCount = 0;
    const MAX_RETRIES = 3;
    let isPatched = false;

    // Logging utility
    const log = {
        info: (msg) => console.log('[Backdrop Patch]', msg),
        debug: (msg) => console.debug('[Backdrop Patch]', msg),
        warn: (msg) => console.warn('[Backdrop Patch]', msg),
        error: (msg, err) => console.error('[Backdrop Patch]', msg, err)
    };

    function cleanupTourElements() {
        const startTime = performance.now();
        const body = document.body;
        let removedCount = 0;

        try {
            // Remove tour-related classes from body
            body.classList.remove('tg-no-interaction');
            body.classList.remove('umb-tour-is-visible');

            // Use more efficient querySelectorAll with combined selectors
            const elements = body.querySelectorAll(
                '.tg-dialog, .tg-backdrop, .umb-backdrop, .umb-backdrop__backdrop, ' +
                '.umb-backdrop__rect, [ng-if*="backdrop"], [ng-if*="highlight"], ' +
                '[ng-click*="backdrop"], [ng-click*="Backdrop"]'
            );

            elements.forEach(el => {
                if (el.classList.contains('umb-backdrop') ||
                    el.hasAttribute('ng-click')) {
                    el.removeAttribute('ng-click');
                    el.removeAttribute('role');
                    el.removeAttribute('tabindex');
                }
                el.remove();
                removedCount++;
            });

            const duration = performance.now() - startTime;
            if (removedCount > 0) {
                log.info(`Cleaned up ${removedCount} elements in ${duration.toFixed(2)}ms`);
            }
            return removedCount;
        } catch (err) {
            log.error('Error in cleanupTourElements:', err);
            return 0;
        }
    }

    function handleAngularScope() {
        try {
            const body = document.body;
            if (!body.hasAttribute('ng-class') && !body.hasAttribute('data-ng-class')) {
                return true; // No Angular bindings needed
            }

            // Wait for Angular to be ready
            if (!window.angular) {
                log.debug('Angular not ready yet');
                return false;
            }

            const scope = angular.element(body).scope();
            if (!scope) {
                log.debug('Angular scope not available');
                return false;
            }

            // Batch all scope changes
            scope.$apply(() => {
                // Set tour show to false
                if (!scope.tour) {
                    scope.tour = {};
                }
                scope.tour.show = false;

                // Handle backdrop-related scope variables
                if (scope.backdrop) {
                    Object.assign(scope.backdrop, {
                        show: false,
                        opacity: 0,
                        element: null,
                        elementPreventClick: false,
                        disableEventsOnClick: false
                    });
                }

                // Handle other backdrop variables in batch
                const scopeUpdates = {
                    highlightElement: false,
                    loading: false,
                    backdropOpacity: 0,
                    infiniteMode: false,
                    highlightPreventClick: false
                };

                Object.entries(scopeUpdates).forEach(([key, value]) => {
                    if (scope[key] !== undefined) {
                        scope[key] = value;
                    }
                });
            });

            log.info('Angular scope updated successfully');
            return true;
        } catch (err) {
            log.error('Error in handleAngularScope:', err);
            return false;
        }
    }

    function initPatch() {
        log.info('Initializing backdrop patch...');
        const startTime = performance.now();

        // Clean up immediately
        const removedCount = cleanupTourElements();

        // Try to handle Angular scope
        const scopeHandled = handleAngularScope();
        if (!scopeHandled) {
            retryCount++;
            if (retryCount <= MAX_RETRIES) {
                log.debug(`Retrying Angular scope handling (${retryCount}/${MAX_RETRIES})`);
                cleanupTimeout = setTimeout(() => {
                    if (handleAngularScope()) {
                        isPatched = true;
                        cleanup(); // Stop observing if successful
                    }
                }, 500 * retryCount); // Exponential backoff
            } else {
                log.warn('Max retries reached for Angular scope handling');
            }
        } else {
            isPatched = true;
        }

        // Create a MutationObserver with debouncing
        let debounceTimer;
        observer = new MutationObserver((mutations) => {
            if (isPatched) return; // Skip if already patched

            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                const relevantMutation = mutations.some(mutation => {
                    // Check for added nodes
                    if (mutation.addedNodes.length) {
                        return Array.from(mutation.addedNodes).some(node =>
                            node.nodeType === 1 && (
                                node.classList?.contains('tg-dialog') ||
                                node.classList?.contains('tg-backdrop') ||
                                node.classList?.contains('umb-backdrop') ||
                                node.classList?.contains('umb-backdrop__backdrop') ||
                                node.classList?.contains('umb-backdrop__rect') ||
                                node.hasAttribute('ng-if') ||
                                node.hasAttribute('ng-click')
                            )
                        );
                    }

                    // Check for class changes on body
                    return mutation.target.tagName === 'BODY' &&
                        mutation.type === 'attributes' &&
                        mutation.attributeName === 'class';
                });

                if (relevantMutation) {
                    const removedCount = cleanupTourElements();
                    if (handleAngularScope() && removedCount === 0) {
                        isPatched = true;
                        cleanup(); // Stop observing if successful
                        log.info('Patch completed successfully');
                    }
                }
            }, 50);
        });

        // Start observing with minimal configuration
        observer.observe(document.body, {
            childList: true,
            attributes: true,
            attributeFilter: ['class', 'ng-if', 'ng-click'],
            subtree: true
        });

        // Override tour guide and backdrop functions
        const noop = () => { };
        Object.assign(window, {
            initTourGuide: noop,
            startTour: noop,
            showTourGuide: noop,
            clickBackdrop: noop,
            handleBackdropClick: noop
        });

        const duration = performance.now() - startTime;
        log.info(`Patch initialization completed in ${duration.toFixed(2)}ms`);
    }

    // Clean up function for page unload
    function cleanup() {
        if (observer) {
            observer.disconnect();
            observer = null;
            log.debug('Observer disconnected');
        }
        if (cleanupTimeout) {
            clearTimeout(cleanupTimeout);
            cleanupTimeout = null;
            log.debug('Cleanup timeout cleared');
        }
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initPatch);
    } else {
        initPatch();
    }

    // Clean up on page unload
    window.addEventListener('unload', cleanup);
})(); 