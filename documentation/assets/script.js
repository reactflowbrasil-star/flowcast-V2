// StreamCore Documentation Scripts

// Copy code to clipboard
function copyCode(button) {
    const codeBlock = button.closest('.code-block');
    const code = codeBlock.querySelector('code').textContent;
    
    navigator.clipboard.writeText(code).then(() => {
        const originalText = button.textContent;
        button.textContent = 'Copied!';
        button.style.borderColor = 'var(--success)';
        button.style.color = 'var(--success)';
        
        setTimeout(() => {
            button.textContent = originalText;
            button.style.borderColor = '';
            button.style.color = '';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
    });
}

// Mobile Menu Logic
function toggleMobileMenu() {
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.querySelector('.mobile-backdrop');
    
    sidebar.classList.toggle('mobile-open');
    backdrop.classList.toggle('active');
    
    if (backdrop.classList.contains('active')) {
        backdrop.style.display = 'block';
        document.body.style.overflow = 'hidden';
    } else {
        setTimeout(() => {
            if (!backdrop.classList.contains('active')) {
                backdrop.style.display = 'none';
            }
        }, 300);
        document.body.style.overflow = '';
    }
}

// Active navigation link based on scroll
document.addEventListener('DOMContentLoaded', function() {
    const sections = document.querySelectorAll('section[id]');
    const navLinks = document.querySelectorAll('.nav-links a');
    const sidebar = document.querySelector('.sidebar');
    
    function updateActiveLink() {
        const scrollPos = window.scrollY + 100;
        
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.offsetHeight;
            const sectionId = section.getAttribute('id');
            
            if (scrollPos >= sectionTop && scrollPos < sectionTop + sectionHeight) {
                navLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === '#' + sectionId) {
                        link.classList.add('active');
                        
                        // Scroll sidebar to active link if needed
                        const linkRect = link.getBoundingClientRect();
                        const sidebarRect = sidebar.getBoundingClientRect();
                        
                        if (linkRect.top < sidebarRect.top || linkRect.bottom > sidebarRect.bottom) {
                            link.scrollIntoView({ block: 'center' });
                        }
                    }
                });
            }
        });
    }
    
    window.addEventListener('scroll', updateActiveLink);
    // Initial call
    setTimeout(updateActiveLink, 100);
    
    // Smooth scroll and close mobile menu on link click
    navLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            const targetId = this.getAttribute('href');
            const targetSection = document.querySelector(targetId);
            
            if (targetSection) {
                // Close mobile menu if open
                if (window.innerWidth <= 768) {
                    const sidebar = document.querySelector('.sidebar');
                    if (sidebar.classList.contains('mobile-open')) {
                        toggleMobileMenu();
                    }
                }

                targetSection.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
                
                // Update URL hash without jumping
                history.pushState(null, null, targetId);
            }
        });
    });
});
