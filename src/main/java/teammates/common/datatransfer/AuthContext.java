package teammates.common.datatransfer;

import java.util.UUID;

/**
 * Represents the authentication context of a user.
 */
public class AuthContext {

    /**
     * The user's Google ID.
     */
    public String id;

    /**
     * The user's account ID.
     */
    public UUID accountId;

    /**
     * Indicates whether the user has admin privilege.
     */
    public boolean isAdmin;

    /**
     * Indicates whether the user has instructor privilege.
     */
    public boolean isInstructor;

    /**
     * Indicates whether the user has student privilege.
     */
    public boolean isStudent;

    /**
     * Indicates whether the user has maintainer privilege.
     */
    public boolean isMaintainer;

    public AuthContext(String googleId, UUID accountId) {
        this.id = googleId;
        this.accountId = accountId;
    }

    public String getId() {
        return id;
    }

    public UUID getAccountId() {
        return accountId;
    }

    public boolean getIsAdmin() {
        return isAdmin;
    }

    public boolean getIsInstructor() {
        return isInstructor;
    }

    public boolean getIsStudent() {
        return isStudent;
    }

    public boolean getIsMaintainer() {
        return isMaintainer;
    }

}
