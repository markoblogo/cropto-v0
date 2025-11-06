# Pull Request

## Description

<!-- Provide a brief description of the changes in this PR -->

## Type of Change

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactoring
- [ ] CI/CD improvement

## Related Issue(s)

<!-- Link to related issues, e.g., "Closes #123" or "Fixes #456" -->

## Acceptance Criteria Checklist

### Code Quality

- [ ] Code follows the project's style guidelines and conventions
- [ ] All new code has appropriate test coverage
- [ ] All existing tests pass (`npm test`)
- [ ] No new compiler warnings or errors
- [ ] Code has been self-reviewed
- [ ] Complex logic is documented with clear comments

### Functionality

- [ ] New features work as expected
- [ ] Bug fixes resolve the reported issues
- [ ] Edge cases and error scenarios are handled
- [ ] No unintended side effects on existing features
- [ ] User-facing changes are intuitive and well-designed

### Database & Schema

- [ ] Database migrations are included (if applicable)
- [ ] Schema changes are backward compatible (if applicable)
- [ ] No destructive changes to production data
- [ ] Database queries are optimized and indexed appropriately

### Security

- [ ] No sensitive data (API keys, passwords, tokens) exposed in code
- [ ] Input validation is implemented where needed
- [ ] Authentication and authorization checks are in place
- [ ] SQL injection and XSS vulnerabilities are prevented

### Testing

- [ ] Manual testing completed successfully
- [ ] Automated tests added for new functionality
- [ ] Integration tests pass
- [ ] CI/CD pipeline passes (GitHub Actions)
- [ ] Demo scenarios tested (see `demo.md` for partner testing script)

### API & Integration

- [ ] API endpoints follow RESTful conventions
- [ ] API responses are properly typed and validated
- [ ] Breaking API changes are documented
- [ ] Integrations with external services are tested

### Documentation

- [ ] Code documentation is updated (JSDoc/TSDoc)
- [ ] README is updated (if applicable)
- [ ] API documentation is updated (if applicable)
- [ ] Migration guide is provided (for breaking changes)
- [ ] `replit.md` is updated with architectural changes

### UI/UX (if applicable)

- [ ] UI components follow design system guidelines
- [ ] Responsive design works on mobile/tablet/desktop
- [ ] Dark mode is supported (if applicable)
- [ ] Accessibility standards are met (ARIA labels, keyboard navigation)
- [ ] Loading states and error messages are user-friendly
- [ ] All interactive elements have `data-testid` attributes

### Performance

- [ ] No performance regressions introduced
- [ ] Database queries are efficient (no N+1 queries)
- [ ] Large datasets are paginated or virtualized
- [ ] Unnecessary re-renders are prevented (React)

### Deployment

- [ ] Environment variables are documented (if new ones added)
- [ ] Database migrations are safe to run in production
- [ ] Feature flags are used for risky changes (if applicable)
- [ ] Rollback plan is documented (for major changes)

## Screenshots (if applicable)

<!-- Add screenshots for UI changes -->

## How to Test

<!-- Provide step-by-step instructions for reviewers to test this PR -->

1. 
2. 
3. 

## Demo Script Verification

<!-- If this affects partner-facing features, verify against demo.md -->

- [ ] Tested login flow with demo users (farmer@demo, trader@demo, broker@demo)
- [ ] Verified demo seed script works correctly
- [ ] Tested margin call scenario with index price 240
- [ ] Verified feedback submission works

## Additional Notes

<!-- Any additional context, dependencies, or considerations for reviewers -->

---

**Reviewer Checklist**

- [ ] Code review completed
- [ ] All acceptance criteria verified
- [ ] Tests reviewed and approved
- [ ] Documentation reviewed
- [ ] Security considerations reviewed
- [ ] Performance impact assessed
- [ ] Ready to merge
