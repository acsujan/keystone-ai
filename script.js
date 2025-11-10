// --- Keystone AI Main Script ---

document.addEventListener('DOMContentLoaded', () => {

    // --- Preloader Logic ---
    const preloader = document.querySelector('.preloader');
    if (preloader) {
        // Skip preloader if we've visited before in this session
        if (sessionStorage.getItem('visitedBefore')) {
            preloader.style.display = 'none';
        } else {
            const preloaderVideo = document.getElementById('preloader-video');
            
            // Speed up preloader video if possible
            if(preloaderVideo) {
                preloaderVideo.playbackRate = 2.0;
                preloaderVideo.addEventListener('ended', () => {
                    preloader.classList.add('hidden');
                    sessionStorage.setItem('visitedBefore', 'true');
                });
            } else {
                // Fallback if video fails
                preloader.style.display = 'none';
                sessionStorage.setItem('visitedBefore', 'true');
            }
        }
    }
    
    // --- High-Performance Custom Cursor ---
    const cursor = document.querySelector('.cursor');
    const follower = document.querySelector('.cursor-follower');

    if (cursor && follower) {
        let lastX = 0;
        let lastY = 0;
        let followerX = 0;
        let followerY = 0;
        let isMoving = false;

        document.addEventListener('mousemove', e => {
            lastX = e.clientX;
            lastY = e.clientY;
            if (!isMoving) {
                isMoving = true;
                requestAnimationFrame(animateCursor);
            }
        });

        function animateCursor() {
            if (!isMoving) return;

            // Animate cursor
            cursor.style.transform = `translate(calc(${lastX}px - 50%), calc(${lastY}px - 50%))`;
            
            // Animate follower with damping
            followerX += (lastX - followerX) * 0.15;
            followerY += (lastY - followerY) * 0.15;
            follower.style.transform = `translate(calc(${followerX}px - 50%), calc(${followerY}px - 50%))`;
            
            // Stop animation if mouse stops
            if (Math.abs(lastX - followerX) < 0.1 && Math.abs(lastY - followerY) < 0.1) {
                isMoving = false;
            } else {
                requestAnimationFrame(animateCursor);
            }
        }

        // Handle hover states
        document.querySelectorAll('a, button, input, textarea, .nav-link, .modal-close').forEach(el => {
            el.addEventListener('mouseenter', () => follower.classList.add('hover'));
            el.addEventListener('mouseleave', () => follower.classList.remove('hover'));
        });
    }

    // --- Global Header Scroll Effect ---
    const header = document.querySelector('.main-header');
    if(header) {
        // Use the correct scroll container (window for sub-pages, .scroll-container for homepage)
        const scrollEl = document.querySelector('.scroll-container') || window;
        
        scrollEl.addEventListener('scroll', () => {
            const scrollTop = scrollEl.scrollTop || window.scrollY;
            header.classList.toggle('scrolled', scrollTop > 50);
        }, { passive: true });
    }

    // --- Homepage: Snap-Scrolling Panel Visibility ---
    // This script finds which panel is visible and adds/removes a class
    // It is separate from the video scrubbing for simplicity.
    const homepageBody = document.querySelector('.homepage-body');
    if (homepageBody) {
        const scrollContainer = document.querySelector('.scroll-container');
        const sections = document.querySelectorAll('.scroll-section');

        if (scrollContainer && sections.length > 0) {
            const observerOptions = {
                root: scrollContainer,
                threshold: 0.6 // 60% of the panel must be visible
            };

            const observer = new IntersectionObserver((entries, obs) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        // Remove 'is-visible' from all
                        sections.forEach(sec => sec.classList.remove('is-visible'));
                        // Add 'is-visible' to the one in view
                        entry.target.classList.add('is-visible');
                    }
                });
            }, observerOptions);

            sections.forEach(section => {
                observer.observe(section);
            });

            // Trigger the first panel on load
            setTimeout(() => {
                if (scrollContainer.scrollTop === 0) {
                    sections[0].classList.add('is-visible');
                }
            }, 300); // Small delay to ensure layout
        }
    }


    // --- Lottie Animations (for How It Works page) ---
    if (typeof lottie !== 'undefined') {
        const createAnimation = (elementId, path) => {
            const container = document.getElementById(elementId);
            if(container) {
                lottie.loadAnimation({ container, renderer: 'svg', loop: true, autoplay: true, path });
            }
        };
        createAnimation('lottie-share', 'https://assets3.lottiefiles.com/packages/lf20_caillwz1.json');
        createAnimation('lottie-ai', 'https://assets5.lottiefiles.com/packages/lf20_v1yudlrx.json');
        createAnimation('lottie-design', 'https://assets6.lottiefiles.com/packages/lf20_jpxsbfxw.json');
    }
    
    // --- Google Form Submission Logic (for demo.html) ---
    const demoForm = document.getElementById('demo-form');
    if (demoForm) {
        demoForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(demoForm);
            try {
                // Post to Google Form in the background
                await fetch(demoForm.action, { 
                    method: 'POST', 
                    body: formData, 
                    mode: 'no-cors' // Google Forms requires no-cors
                });
            } catch (error) {
                console.error('Form submission failed:', error);
                // Don't block navigation even if it fails
            } finally {
                // Redirect to the thank-you page
                window.location.href = 'thanks.html';
            }
        });
    }

    // --- NEW: Waitlist Modal Logic (for pricing.html) ---
    const modal = document.getElementById('waitlist-modal');
    const openButtons = document.querySelectorAll('.open-waitlist-modal');
    const closeButton = document.getElementById('modal-close-button');

    if (modal && openButtons.length > 0 && closeButton) {
        
        // Function to open the modal
        const openModal = () => {
            document.body.classList.add('modal-open');
        };

        // Function to close the modal
        const closeModal = () => {
            document.body.classList.remove('modal-open');
        };

        // Add listeners to all "Get Started" buttons
        openButtons.forEach(button => {
            button.addEventListener('click', openModal);
        });

        // Add listener to the close button
        closeButton.addEventListener('click', closeModal);

        // Add listener to the overlay itself to close (optional)
        modal.addEventListener('click', (e) => {
            // Only close if they click the overlay, not the content
            if (e.target === modal) {
                closeModal();
            }
        });
    }

});