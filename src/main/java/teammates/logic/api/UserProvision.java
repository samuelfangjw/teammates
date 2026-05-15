package teammates.logic.api;

import teammates.common.datatransfer.AuthContext;
import teammates.common.datatransfer.UserInfo;
import teammates.common.datatransfer.UserInfoCookie;
import teammates.common.util.Config;
import teammates.logic.core.AccountsLogic;
import teammates.logic.core.UsersLogic;
import teammates.storage.entity.Account;

/**
 * Handles logic related to username and user role provisioning.
 */
public class UserProvision {

    private static final UserProvision instance = new UserProvision();

    private final UsersLogic usersLogic = UsersLogic.inst();

    private final AccountsLogic accountsLogic = AccountsLogic.inst();

    UserProvision() {
        // prevent initialization
    }

    public static UserProvision inst() {
        return instance;
    }

    /**
     * Gets the information of the current logged in user.
     */
    public AuthContext getCurrentUserContext(UserInfoCookie uic) {
        AuthContext user = getCurrentLoggedInUserContext(uic);

        if (user == null) {
            return null;
        }

        String userId = user.id;
        user.isAdmin = Config.getAppAdmins().contains(userId);
        user.isInstructor = usersLogic.isInstructorInAnyCourse(userId);
        user.isStudent = usersLogic.isStudentInAnyCourse(userId);
        user.isMaintainer = Config.getAppMaintainers().contains(userId);
        return user;
    }

    /**
     * Gets the current logged in user.
     */
    AuthContext getCurrentLoggedInUserContext(UserInfoCookie uic) {
        if (uic == null || !uic.isValid()) {
            return null;
        }

        return new AuthContext(uic.getUserId(), uic.getAccountId());
    }

    /**
     * Gets the information of the current masqueraded user.
     */
    public AuthContext getMasqueradeUserContext(String googleId) {
        Account account = accountsLogic.getAccountForGoogleId(googleId);
        AuthContext authContext = new AuthContext(googleId, account == null ? null : account.getId());
        authContext.isAdmin = false;
        authContext.isInstructor = usersLogic.isInstructorInAnyCourse(googleId);
        authContext.isStudent = usersLogic.isStudentInAnyCourse(googleId);
        authContext.isMaintainer = Config.getAppMaintainers().contains(googleId);
        return authContext;
    }

    /**
     * Gets the information of a user who has administrator role only.
     */
    public AuthContext getAdminOnlyUserContext(String userId) {
        Account account = userId == null ? null : accountsLogic.getAccountForGoogleId(userId);
        AuthContext authContext = new AuthContext(userId, account == null ? null : account.getId());
        authContext.isAdmin = true;
        return authContext;
    }

    /**
     * Gets the information of a user from an AuthContext.
     */
    public UserInfo getUserInfo(AuthContext authContext) {
        if (authContext == null) {
            return null;
        }

        UserInfo userInfo = new UserInfo(authContext.id, authContext.accountId);
        userInfo.isAdmin = Config.getAppAdmins().contains(authContext.id);
        userInfo.isInstructor = usersLogic.isInstructorInAnyCourse(authContext.id);
        userInfo.isStudent = usersLogic.isStudentInAnyCourse(authContext.id);
        userInfo.isMaintainer = Config.getAppMaintainers().contains(authContext.id);
        return userInfo;
    }
}
