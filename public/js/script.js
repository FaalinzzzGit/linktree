document.addEventListener("DOMContentLoaded", function () {
  // Auth forms toggle
  const authForms = document.querySelectorAll(".auth-form");
  const toggleForms = document.querySelectorAll("[data-toggle-form]");

  if (toggleForms.length) {
    toggleForms.forEach((button) => {
      button.addEventListener("click", (e) => {
        e.preventDefault();
        const target = button.getAttribute("data-toggle-form");

        authForms.forEach((form) => {
          form.style.display = "none";
        });

        document.getElementById(target).style.display = "block";
      });
    });
  }

  // Dashboard tabs
  const tabButtons = document.querySelectorAll("[data-tab]");
  const tabContents = document.querySelectorAll(".tab-content");

  if (tabButtons.length) {
    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const tabId = button.getAttribute("data-tab");

        // Update active tab button
        tabButtons.forEach((btn) => {
          btn.classList.remove("active");
        });
        button.classList.add("active");

        // Show corresponding tab content
        tabContents.forEach((content) => {
          content.style.display = "none";
        });
        document.getElementById(tabId).style.display = "block";
      });
    });

    // Activate first tab by default
    if (tabButtons[0]) {
      tabButtons[0].click();
    }
  }

  // Add link form toggle
  const addLinkBtn = document.getElementById("add-link-btn");
  const addLinkForm = document.getElementById("add-link-form");

  if (addLinkBtn && addLinkForm) {
    addLinkBtn.addEventListener("click", () => {
      addLinkForm.style.display =
        addLinkForm.style.display === "none" ? "block" : "none";
    });
  }

  // Handle form submissions
  const forms = document.querySelectorAll("form:not(.no-ajax)");

  forms.forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();

      const formData = new FormData(form);
      const action = form.getAttribute("action");
      const method = form.getAttribute("method") || "POST";

      const submitBtn = form.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.disabled = true;
      submitBtn.textContent = "Processing...";

      try {
        const response = await fetch(action, {
          method,
          body: JSON.stringify(Object.fromEntries(formData)),
          headers: {
            "Content-Type": "application/json",
          },
        });

        const data = await response.json();

        if (response.ok) {
          if (data.redirect) {
            window.location.href = data.redirect;
          } else if (data.message) {
            alert(data.message);
            if (form.id === "register-form" || form.id === "login-form") {
              form.reset();
            }
          }
        } else {
          alert(data.message || "An error occurred");
        }
      } catch (error) {
        console.error("Error:", error);
        alert("An error occurred. Please try again.");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
      }
    });
  });

  // Theme color picker
  const themeColorInput = document.getElementById("themeColor");
  if (themeColorInput) {
    themeColorInput.addEventListener("input", (e) => {
      document.documentElement.style.setProperty(
        "--primary-color",
        e.target.value
      );
      document.documentElement.style.setProperty(
        "--primary-light",
        adjustColor(e.target.value, 20)
      );
      document.documentElement.style.setProperty(
        "--primary-dark",
        adjustColor(e.target.value, -20)
      );
    });
  }
});

function adjustColor(color, amount) {
  return (
    "#" +
    color
      .replace(/^#/, "")
      .replace(/../g, (color) =>
        (
          "0" +
          Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)
        ).substr(-2)
      )
  );
}
