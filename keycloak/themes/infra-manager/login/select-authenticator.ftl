<#import "template.ftl" as layout>
<@layout.registrationLayout displayInfo=false; section>

    <#if section = "header" || section = "show-username">
        <#if section = "header">
            ${msg("loginChooseAuthenticator")}
        </#if>
    <#elseif section = "form">

    <ul class="${properties.kcSelectAuthListClass!}" role="list">
        <#list auth.authenticationSelections as authenticationSelection>
            <li class="${properties.kcSelectAuthListItemWrapperClass!}" data-icon="${authenticationSelection.iconCssClass}">
                <form id="kc-select-credential-form-${authenticationSelection?index}" class="${properties.kcFormClass!}" action="${url.loginAction}" method="post">
                    <input type="hidden" name="authenticationExecution" value="${authenticationSelection.authExecId}">
                </form>
                <div class="${properties.kcSelectAuthListItemClass!}" onclick="document.getElementById('kc-select-credential-form-${authenticationSelection?index}').requestSubmit()">
                    <div class="pf-v5-c-data-list__item-content">
                        <div class="${properties.kcSelectAuthListItemIconClass!}">
                            <i class="${properties['${authenticationSelection.iconCssClass}']!authenticationSelection.iconCssClass} ${properties.kcSelectAuthListItemIconPropertyClass!}"></i>
                        </div>
                        <div class="${properties.kcSelectAuthListItemBodyClass!}">
                            <h2 class="${properties.kcSelectAuthListItemHeadingClass!}">
                                ${msg('${authenticationSelection.displayName}')}
                            </h2>
                        </div>
                        <div class="${properties.kcSelectAuthListItemDescriptionClass!}">
                            ${msg('${authenticationSelection.helpText}')}
                        </div>
                    </div>
                    <div class="${properties.kcSelectAuthListItemFillClass!}">
                        <i class="${properties.kcSelectAuthListItemArrowIconClass!}" aria-hidden="true"></i>
                    </div>
                </div>
            </li>
        </#list>
    </ul>

    <#-- Auto-redirect: if exactly 2 options, skip this page and go straight to the non-password one -->
    <script>
    (function() {
        var items = document.querySelectorAll('[data-icon]');
        if (items.length === 2) {
            for (var i = 0; i < items.length; i++) {
                var icon = items[i].getAttribute('data-icon');
                if (icon && icon.indexOf('webauthn') !== -1) {
                    document.getElementById('kc-select-credential-form-' + i).requestSubmit();
                    return;
                }
            }
        }
    })();
    </script>

    </#if>
</@layout.registrationLayout>
