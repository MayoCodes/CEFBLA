const closeBannerBtn = document.getElementById('closeBanner');
if (closeBannerBtn) {
    closeBannerBtn.addEventListener('click', () => {
        document.getElementById('globalErrorBanner').classList.remove('show');
    });
}

window.addEventListener('scroll', () => {
    const navbar = document.getElementById('navbar');
    const countdown = document.getElementById('countdown');
    if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
        countdown.classList.add('scrolled');
    } else {
        navbar.classList.remove('scrolled');
        countdown.classList.remove('scrolled');
    }
});

document.getElementById('mobileMenu').addEventListener('click', () => {
    document.getElementById('navLinks').classList.toggle('active');
});


document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const href = this.getAttribute('href');
        
        if (href === '#' || href.length <= 1) {
            return;
        }
        
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            document.getElementById('navLinks').classList.remove('active');
        }
    });
});

const countdownDate = new Date().getTime() + (7 * 24 * 60 * 60 * 1000);

function updateCountdown() {
    const now = new Date().getTime();
    const distance = countdownDate - now;

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((distance % (1000 * 60)) / 1000);

    document.getElementById('days').textContent = String(days).padStart(2, '0');
    document.getElementById('hours').textContent = String(hours).padStart(2, '0');
    document.getElementById('minutes').textContent = String(minutes).padStart(2, '0');
    document.getElementById('seconds').textContent = String(seconds).padStart(2, '0');

    if (distance < 0) {
        document.querySelector('.countdown-title').textContent = 'Challenge is Live!';
    }
}

setInterval(updateCountdown, 1000);
updateCountdown();

window.switchTab = function(exercise) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    event.target.classList.add('active');

    if (window.firestoreUsers && window.displayLeaderboardForExercise) {
        window.displayLeaderboardForExercise(exercise, window.firestoreUsers);
    }
}


window.addEventListener('scroll', () => {
    const scrolled = window.pageYOffset;
    const heroBackground = document.getElementById('heroBackground');
    
    if (heroBackground && scrolled < window.innerHeight) {
        heroBackground.style.transform = `translateY(${scrolled * 0.5}px)`;
    }
});

const observerOptions = {
    threshold: 0.15,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.classList.add('active');
        }
    });
}, observerOptions);

document.querySelectorAll('.scroll-animate').forEach(el => {
    observer.observe(el);
});