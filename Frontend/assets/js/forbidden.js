const permission = new URLSearchParams(window.location.search).get("permission");
const reasonElement = document.querySelector("#forbiddenReason");
const homeLink = document.querySelector("#homeLink");

if (permission && reasonElement) {
  reasonElement.textContent = `You do not currently have access to the ${permission.toLowerCase()} page.`;
}

homeLink?.addEventListener("click", (event) => {
  const session = window.localStorage.getItem("ops-suite-session");

  if (!session) {
    event.preventDefault();
    window.location.href = "./index.html";
  }
});
