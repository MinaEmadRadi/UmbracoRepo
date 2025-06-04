// Patch to prevent unwanted tour guide dialog
(function () {
    let cleanupTimeout;
    let observer;

    function cleanupTourElements() {
        // Remove tour-related classes from body
        document.body.classList.remove('tg-no-interaction');
        document.body.classList.remove('umb-tour-is-visible');

        // Remove any existing tour guide elements and backdrops
        document.querySelectorAll(
            '.tg-dialog, .tg-backdrop, .umb-backdrop, .umb-backdrop__backdrop, .umb-backdrop__rect'
        ).forEach(el => el.remove());

        // Also remove any elements with ng-if containing backdrop or highlight
        document.querySelectorAll('[ng-if*="backdrop"], [ng-if*="highlight"]').forEach(el => el.remove());

        // Remove any click handlers
        document.querySelectorAll('[ng-click*="backdrop"], [ng-click*="Backdrop"]').forEach(el => {
            el.removeAttribute('ng-click');
            el.removeAttribute('role');
            el.removeAttribute('tabindex');
        });
    }

    function handleAngularScope() {
        const body = document.body;
        if (!body.hasAttribute('ng-class') && !body.hasAttribute('data-ng-class')) {
            return;
        }

        try {
            // Wait for Angular to be ready
            if (!window.angular) {
                return false;
            }

            const scope = angular.element(body).scope();
            if (!scope) {
                return false;
            }

            // Set tour show to false
            if (!scope.tour) {
                scope.tour = {};
            }
            scope.tour.show = false;

            // Handle backdrop-related scope variables
            if (scope.backdrop) {
                scope.backdrop.show = false;
                scope.backdrop.opacity = 0;
                scope.backdrop.element = null;
                scope.backdrop.elementPreventClick = false;
                scope.backdrop.disableEventsOnClick = false;
            }

            // Handle other backdrop variables
            if (scope.highlightElement !== undefined) {
                scope.highlightElement = false;
            }
            if (scope.loading !== undefined) {
                scope.loading = false;
            }
            if (scope.backdropOpacity !== undefined) {
                scope.backdropOpacity = 0;
            }
            if (scope.infiniteMode !== undefined) {
                scope.infiniteMode = false;
            }
            if (scope.highlightPreventClick !== undefined) {
                scope.highlightPreventClick = false;
            }

            // Apply changes if needed
            if (scope.$root && !scope.$root.$$phase) {
                scope.$apply();
            }

            return true;
        } catch (e) {
            console.debug('Angular scope not ready');
            return false;
        }
    }

    function initPatch() {
        // Clean up immediately
        cleanupTourElements();

        // Try to handle Angular scope
        if (!handleAngularScope()) {
            // If Angular isn't ready, try again in a moment
            cleanupTimeout = setTimeout(() => {
                handleAngularScope();
                // Try one last time after a longer delay
                setTimeout(handleAngularScope, 2000);
            }, 500);
        }

        // Create a MutationObserver with debouncing
        let debounceTimer;
        observer = new MutationObserver((mutations) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                let needsCleanup = false;

                for (const mutation of mutations) {
                    // Check for added nodes
                    if (mutation.addedNodes.length) {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === 1 && (
                                node.classList?.contains('tg-dialog') ||
                                node.classList?.contains('tg-backdrop') ||
                                node.classList?.contains('umb-backdrop') ||
                                node.classList?.contains('umb-backdrop__backdrop') ||
                                node.classList?.contains('umb-backdrop__rect') ||
                                node.hasAttribute('ng-if') ||
                                node.hasAttribute('ng-click')
                            )) {
                                needsCleanup = true;
                                break;
                            }
                        }
                    }

                    // Check for class changes on body
                    if (!needsCleanup &&
                        mutation.target.tagName === 'BODY' &&
                        mutation.type === 'attributes' &&
                        mutation.attributeName === 'class') {
                        needsCleanup = true;
                    }

                    if (needsCleanup) break;
                }

                if (needsCleanup) {
                    cleanupTourElements();
                    handleAngularScope();
                }
            }, 50); // Small delay for debouncing
        });

        // Start observing with minimal configuration
        observer.observe(document.body, {
            childList: true,
            attributes: true,
            attributeFilter: ['class', 'ng-if', 'ng-click'],
            subtree: true // Watch all children for ng-if and ng-click
        });

        // Clean up immediately
        cleanupTourElements();

        // Override tour guide functions
        const noop = () => { };
        window.initTourGuide = noop;
        window.startTour = noop;
        window.showTourGuide = noop;

        // Override backdrop click handlers
        window.clickBackdrop = noop;
        window.handleBackdropClick = noop;
    }

    // Clean up function for page unload
    function cleanup() {
        if (observer) {
            observer.disconnect();
        }
        if (cleanupTimeout) {
            clearTimeout(cleanupTimeout);
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